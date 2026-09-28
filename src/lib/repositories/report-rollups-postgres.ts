import { randomUUID } from "crypto";
import { execute, query, queryOne, queryAsSystem } from "@/lib/db/query";
import { createUserNotification } from "@/lib/server/notifications";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  permissionTemplates?: any[];
};

type RefreshInput = {
  reportKey: string;
  scopeType?: "ORG" | "TEAM" | "USER" | "PARTNER";
  scopeId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  reason?: "SCHEDULED" | "MANUAL" | "BACKFILL";
};

const ROLLUP_COLUMNS =
  'id, "tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd", grain, dimensions, metrics, "sourceWatermark", "lastComputedAt", "createdAt", "updatedAt"';
const STATE_COLUMNS =
  'id, "tenantId", "reportKey", "scopeType", "scopeId", "lastStartedAt", "lastCompletedAt", "lastSuccessfulAt", "lastSourceWatermark", status, error, "refreshIntervalMinutes", "manualRefreshRequestedAt", "manualRefreshRequestedBy", "createdAt", "updatedAt"';
const JOB_COLUMNS =
  'id, "tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd", "requestedBy", reason, status, "startedAt", "completedAt", error, "createdAt"';

export async function requestReportRollupRefresh(user: TenantUser, input: RefreshInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.reportKey) throw new Error("REPORT_KEY_REQUIRED");
  const now = new Date().toISOString();
  const scopeType = input.scopeType ?? "ORG";
  const scopeId = input.scopeId ?? null;

  await upsertRefreshState(user, input.reportKey, scopeType, scopeId, {
    status: "STALE",
    manualRefreshRequestedAt: now,
    manualRefreshRequestedBy: user.id,
    updatedAt: now,
  });

  const row = await queryOne(
    `insert into "ReportRefreshJob"
      (id, "tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd", "requestedBy", reason, status, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10)
     returning ${JOB_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      input.reportKey,
      scopeType,
      scopeId,
      input.periodStart ?? null,
      input.periodEnd ?? null,
      user.id,
      input.reason ?? "MANUAL",
      now,
    ],
  );
  if (!row) throw new Error("REPORT_REFRESH_JOB_INSERT_FAILED");
  return row;
}

export async function refreshReportRollupForTenant(user: TenantUser, input: RefreshInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.reportKey) throw new Error("REPORT_KEY_REQUIRED");
  const now = new Date().toISOString();
  const scopeType = input.scopeType ?? "ORG";
  const scopeId = input.scopeId ?? null;

  await upsertRefreshState(user, input.reportKey, scopeType, scopeId, {
    status: "REFRESHING",
    lastStartedAt: now,
    error: null,
    updatedAt: now,
  });

  try {
    const report = await renderRollupReport(user, input.reportKey);
    const sourceWatermark = inferSourceWatermark(report) ?? now;
    const rollup = await queryOne(
      `insert into "ReportRollup"
        (id, "tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd", grain, dimensions, metrics, "sourceWatermark", "lastComputedAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $12)
       returning ${ROLLUP_COLUMNS}`,
      [
        randomUUID(),
        user.tenantId,
        input.reportKey,
        scopeType,
        scopeId,
        input.periodStart ?? null,
        input.periodEnd ?? null,
        input.periodStart || input.periodEnd ? "CUSTOM" : "CURRENT",
        { scopeType, scopeId, periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null },
        report,
        sourceWatermark,
        now,
      ],
    );
    if (!rollup) throw new Error("REPORT_ROLLUP_INSERT_FAILED");

    await upsertRefreshState(user, input.reportKey, scopeType, scopeId, {
      status: "FRESH",
      lastCompletedAt: now,
      lastSuccessfulAt: now,
      lastSourceWatermark: sourceWatermark,
      manualRefreshRequestedAt: null,
      error: null,
      updatedAt: now,
    });

    return rollup;
  } catch (error) {
    await upsertRefreshState(user, input.reportKey, scopeType, scopeId, {
      status: "ERROR",
      lastCompletedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown refresh error",
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export async function listReportRefreshStatesForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return query(
    `select ${STATE_COLUMNS} from "ReportRefreshState" where "tenantId" = $1 order by "updatedAt" desc`,
    [user.tenantId],
  );
}

export async function updateReportRefreshPolicyForTenant(
  user: TenantUser,
  input: { reportKey: string; scopeType?: "ORG" | "TEAM" | "USER" | "PARTNER"; scopeId?: string | null; refreshIntervalMinutes: number },
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!input.reportKey) throw new Error("REPORT_KEY_REQUIRED");
  if (!Number.isFinite(input.refreshIntervalMinutes) || input.refreshIntervalMinutes < 1) {
    throw new Error("INVALID_REFRESH_INTERVAL");
  }
  return upsertRefreshState(user, input.reportKey, input.scopeType ?? "ORG", input.scopeId ?? null, {
    refreshIntervalMinutes: Math.round(input.refreshIntervalMinutes),
    updatedAt: new Date().toISOString(),
  });
}

// Scheduled half of "manual refresh, scheduled refresh" -- until now the only way a
// ReportRefreshJob was ever created was the admin-triggered API route (reason 'MANUAL').
// ReportRefreshState.refreshIntervalMinutes already existed in the schema but nothing ever
// read it. This scans for states that are due (or have never completed) and don't already
// have a job in flight, and enqueues a 'SCHEDULED' job for each -- reusing the exact same
// processPendingReportRefreshJobs consumer, not a second refresh pipeline.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers due
// rollup states across every tenant at once.
export async function processDueReportRollupRefreshes(limit = 50) {
  const due = await queryAsSystem<any>(
    `select s."tenantId", s."reportKey", s."scopeType", s."scopeId"
     from "ReportRefreshState" s
     where s.status <> 'REFRESHING'
       and (
         s."lastSuccessfulAt" is null
         or s."lastSuccessfulAt" <= now() - (greatest(s."refreshIntervalMinutes", 1) || ' minutes')::interval
       )
       and not exists (
         select 1 from "ReportRefreshJob" j
         where j."tenantId" = s."tenantId"
           and j."reportKey" = s."reportKey"
           and j."scopeType" = s."scopeType"
           and (j."scopeId" = s."scopeId" or (j."scopeId" is null and s."scopeId" is null))
           and j.status in ('PENDING', 'RUNNING')
       )
     order by s."lastSuccessfulAt" asc nulls first
     limit $1`,
    [limit],
  );

  const enqueued = [];
  for (const state of due) {
    const job = await queryOne<{ id: string }>(
      `insert into "ReportRefreshJob"
        (id, "tenantId", "reportKey", "scopeType", "scopeId", "periodStart", "periodEnd", "requestedBy", reason, status, "createdAt")
       values ($1, $2, $3, $4, $5, null, null, null, 'SCHEDULED', 'PENDING', $6)
       returning id`,
      [randomUUID(), state.tenantId, state.reportKey, state.scopeType, state.scopeId, new Date().toISOString()],
    );
    if (job) enqueued.push({ tenantId: state.tenantId, reportKey: state.reportKey, scopeType: state.scopeType, scopeId: state.scopeId, jobId: job.id });
  }
  return { enqueued };
}

// Failed-refresh alert -- reuses the same createUserNotification primitive the webhook outbox
// and scoring worker jobs already use for this exact kind of "background job failed" alert,
// rather than building a separate notification path. A MANUAL job's requester gets notified
// directly; a SCHEDULED job has no requester, so it falls back to the tenant's earliest-created
// user, matching webhook-outbox.ts's own "no specific owner" precedent.
async function notifyReportRollupRefreshFailed(job: any, message: string) {
  let userId = job.requestedBy as string | null;
  if (!userId) {
    const owner = await queryOne<{ id: string }>(`select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`, [job.tenantId]);
    userId = owner?.id ?? null;
  }
  if (!userId) return;
  await createUserNotification({
    tenantId: job.tenantId,
    userId,
    title: "Report rollup refresh failed",
    message: `Refreshing "${job.reportKey}" failed: ${message}.`,
    data: { type: "reports.rollupRefreshFailed", reportKey: job.reportKey, scopeType: job.scopeType, scopeId: job.scopeId, error: message },
    category: "REPORTS",
  });
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers pending
// jobs across every tenant at once.
export async function processPendingReportRefreshJobs(limit = 25) {
  const jobs = await queryAsSystem<any>(
    `select ${JOB_COLUMNS}
     from "ReportRefreshJob"
     where status = 'PENDING'
     order by "createdAt" asc
     limit $1`,
    [limit],
  );

  const processed = [];
  for (const job of jobs) {
    const startedAt = new Date().toISOString();
    await execute('update "ReportRefreshJob" set status = $1, "startedAt" = $2 where id = $3', ["RUNNING", startedAt, job.id]);
    try {
      const rollup = await refreshReportRollupForTenant(
        { id: job.requestedBy ?? "report-refresh-worker", tenantId: job.tenantId },
        {
          reportKey: job.reportKey,
          scopeType: job.scopeType,
          scopeId: job.scopeId,
          periodStart: job.periodStart,
          periodEnd: job.periodEnd,
          reason: job.reason,
        },
      );
      await execute(
        'update "ReportRefreshJob" set status = $1, "completedAt" = $2, error = null where id = $3',
        ["SUCCEEDED", new Date().toISOString(), job.id],
      );
      processed.push({ jobId: job.id, status: "SUCCEEDED", rollupId: (rollup as any).id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown refresh error";
      await execute(
        'update "ReportRefreshJob" set status = $1, "completedAt" = $2, error = $3 where id = $4',
        ["FAILED", new Date().toISOString(), message, job.id],
      );
      processed.push({ jobId: job.id, status: "FAILED", error: message });
      await notifyReportRollupRefreshFailed(job, message).catch(() => undefined);
    }
  }

  return { processed };
}

async function upsertRefreshState(
  user: TenantUser,
  reportKey: string,
  scopeType: string,
  scopeId: string | null,
  patch: Record<string, unknown>,
) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const values: unknown[] = [user.tenantId, reportKey, scopeType];
  const scopeClause = scopeId ? `"scopeId" = $4` : '"scopeId" is null';
  if (scopeId) values.push(scopeId);
  const existing = await queryOne<any>(
    `select ${STATE_COLUMNS}
     from "ReportRefreshState"
     where "tenantId" = $1 and "reportKey" = $2 and "scopeType" = $3 and ${scopeClause}
     limit 1`,
    values,
  );

  if (existing) {
    const columns = Object.keys(patch);
    const patchValues = columns.map((column) => patch[column]);
    const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
    return queryOne(
      `update "ReportRefreshState" set ${assignments} where id = $${columns.length + 1} returning ${STATE_COLUMNS}`,
      [...patchValues, existing.id],
    );
  }

  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    tenantId: user.tenantId,
    reportKey,
    scopeType,
    scopeId,
    status: "STALE",
    refreshIntervalMinutes: 15,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
  const columns = Object.keys(row);
  const rowValues = columns.map((column) => (row as Record<string, unknown>)[column]);
  const inserted = await queryOne(
    `insert into "ReportRefreshState" (${columns.map((column) => `"${column}"`).join(", ")})
     values (${columns.map((_, index) => `$${index + 1}`).join(", ")})
     returning ${STATE_COLUMNS}`,
    rowValues,
  );
  if (!inserted) throw new Error("REPORT_REFRESH_STATE_INSERT_FAILED");
  return inserted;
}

async function renderRollupReport(user: TenantUser, reportKey: string) {
  const reports = await import("@/lib/server/inbuilt-reports");
  if (reportKey === "funnel_conversion_by_stage") return reports.getFunnelByStageReportForTenant(user);
  if (reportKey === "funnel_conversion_by_source_campaign") return reports.getFunnelBySourceCampaignReportForTenant(user);
  if (reportKey === "rep_performance") return reports.getRepPerformanceReportForTenant(user);
  if (reportKey === "sla_response_breaches") return reports.getSlaResponseBreachReportForTenant(user);
  if (reportKey === "lead_source_roi") return reports.getLeadSourceRoiReportForTenant(user);
  if (reportKey === "reassignment_impact") return reports.getReassignmentImpactReportForTenant(user);
  if (reportKey === "activity_call_volume_trends") return reports.getActivityCallVolumeTrendReportForTenant(user);
  if (reportKey === "commission_payout_summary") return reports.getCommissionPayoutSummaryReportForTenant(user);
  if (reportKey === "cohort_funnel_progression") return reports.getCohortReportForTenant(user);
  if (reportKey === "data_quality") return reports.getDataQualityReportForTenant(user);
  throw new Error("UNKNOWN_REPORT_KEY");
}

function inferSourceWatermark(report: any): string | null {
  if (report?.generatedAt) return report.generatedAt;
  if (report?.meta?.generatedAt) return report.meta.generatedAt;
  return null;
}

// Gap checklist Module 17, item 24 ("analytics performance layer" -- cache invalidation as an
// explicit concept, previously timer-only: a rollup only ever went stale on
// refreshIntervalMinutes, never because the underlying data actually changed). Deliberately
// coarse -- marks every one of the tenant's ReportRefreshState rows STALE (skipping any
// currently REFRESHING, so an in-flight run isn't corrupted) rather than trying to map which
// specific reportKey depends on which entity type. Better to over-invalidate (a handful of
// unrelated reports refresh a bit sooner than strictly necessary) than under-invalidate (a
// report keeps confidently showing FRESH while the data behind it has already changed).
export async function invalidateReportRollupsForTenant(tenantId: string | null | undefined) {
  if (!tenantId) return;
  await execute(
    `update "ReportRefreshState" set status = 'STALE', "updatedAt" = $1 where "tenantId" = $2 and status <> 'REFRESHING'`,
    [new Date().toISOString(), tenantId],
  );
}
