import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

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

export async function processPendingReportRefreshJobs(limit = 25) {
  const jobs = await query<any>(
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
