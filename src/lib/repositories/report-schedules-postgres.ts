import { randomUUID } from "crypto";
import { execute, query, queryOne, queryAsSystem } from "@/lib/db/query";
import { assertFeatureEnabled, isFeatureEnabledForTenant } from "@/lib/server/entitlements";
import { createExportRequestForUser, processExportRequest } from "@/lib/server/exports";
import { queueCommunicationForTenant } from "@/lib/server/communications";
import { readPrivateFile } from "@/lib/storage/file-storage";
import { createAuditLog } from "@/lib/server/crm";

// The exact reportKey set inbuiltReportRows (exports.ts) knows how to render -- kept in sync
// manually since that function isn't exported; a CSV/XLSX/PDF-format schedule for any other
// reportKey (e.g. a custom query-definition-based schedule) has no rendering path yet and is
// handled as an explicit, reported gap rather than silently falling back to something else.
// Gap checklist Module 17, item 19: this same set now also gates XLSX/PDF, not just CSV --
// exports.ts's fetchExportContent renders all 3 formats from the identical row data.
const FILE_EXPORTABLE_REPORT_KEYS = new Set([
  "funnel_conversion_by_stage",
  "funnel_conversion_by_source_campaign",
  "rep_performance",
  "sla_response_breaches",
  "lead_source_roi",
  "reassignment_impact",
  "activity_call_volume_trends",
  "commission_payout_summary",
  "cohort_funnel_progression",
  "data_quality",
]);

// This is the first feature in this codebase that emails a link to someone who may not be an
// authenticated CRM user at all (an arbitrary subscription recipient) -- no base-URL
// convention existed anywhere to reuse, so this introduces the minimal one needed.
function getAppBaseUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

type TenantUser = {
  id: string;
  tenantId: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
};

type ScheduleInput = {
  reportKey?: string;
  queryDefinition?: Record<string, unknown> | null;
  recipients?: string[];
  format?: "LINK" | "CSV" | "PDF" | "XLSX";
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  nextRunAt?: string | null;
  isActive?: boolean;
};

const SCHEDULE_COLUMNS =
  'id, "tenantId", "userId", "reportKey", "queryDefinition", recipients, format, frequency, "dayOfWeek", "dayOfMonth", "nextRunAt", "lastRunAt", "lastStatus", "isActive", "retryCount", "nextRetryAt", "createdAt", "updatedAt"';

// Gap checklist Module 17, item 19 ("scheduled extracts" -- automatic retry of a failed report
// *generation*, mirroring the exact backoff ladder webhook-outbox.ts already uses for delivery
// retries). Errors that retrying can't fix (a governance gate, a config/schema mismatch) are
// excluded so a schedule doesn't burn its retry budget on something that will never succeed.
const REPORT_RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h
const NON_RETRYABLE_ERRORS = new Set(["EXPORT_PENDING_APPROVAL", "UNKNOWN_REPORT_KEY"]);

function isRetryableGenerationError(error: string | null | undefined): boolean {
  if (!error) return true;
  if (NON_RETRYABLE_ERRORS.has(error)) return false;
  if (error.endsWith("_EXPORT_NOT_AVAILABLE")) return false;
  return true;
}

export async function listReportSchedulesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];
  return query(
    `select ${SCHEDULE_COLUMNS}
     from "ReportSchedule"
     where "tenantId" = $1 and "userId" = $2
     order by "createdAt" desc`,
    [user.tenantId, user.id],
  );
}

export async function createReportScheduleForTenant(user: TenantUser, input: ScheduleInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  if (!input.reportKey) throw new Error("REPORT_KEY_REQUIRED");
  const recipients = normalizeRecipients(input.recipients, user.email);
  if (recipients.length === 0) throw new Error("RECIPIENTS_REQUIRED");

  const now = new Date();
  const frequency = input.frequency ?? "WEEKLY";
  const nextRunAt = input.nextRunAt ? new Date(input.nextRunAt) : computeNextRun(frequency, input.dayOfWeek, input.dayOfMonth, now);
  const row = await queryOne(
    `insert into "ReportSchedule"
      (id, "tenantId", "userId", "reportKey", "queryDefinition", recipients, format, frequency, "dayOfWeek", "dayOfMonth", "nextRunAt", "isActive", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
     returning ${SCHEDULE_COLUMNS}`,
    [
      randomUUID(),
      user.tenantId,
      user.id,
      input.reportKey,
      input.queryDefinition ?? null,
      recipients,
      input.format ?? "LINK",
      frequency,
      input.dayOfWeek ?? null,
      input.dayOfMonth ?? null,
      nextRunAt.toISOString(),
      input.isActive ?? true,
      now.toISOString(),
    ],
  );
  if (!row) throw new Error("REPORT_SCHEDULE_INSERT_FAILED");
  return row;
}

export async function updateReportScheduleForTenant(user: TenantUser, id: string, input: ScheduleInput) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.reportKey !== undefined) patch.reportKey = input.reportKey;
  if (input.queryDefinition !== undefined) patch.queryDefinition = input.queryDefinition;
  if (input.recipients !== undefined) patch.recipients = normalizeRecipients(input.recipients, user.email);
  if (input.format !== undefined) patch.format = input.format;
  if (input.frequency !== undefined) patch.frequency = input.frequency;
  if (input.dayOfWeek !== undefined) patch.dayOfWeek = input.dayOfWeek;
  if (input.dayOfMonth !== undefined) patch.dayOfMonth = input.dayOfMonth;
  if (input.nextRunAt !== undefined) patch.nextRunAt = input.nextRunAt;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const columns = Object.keys(patch);
  const values = columns.map((column) => patch[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  return queryOne(
    `update "ReportSchedule"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and "userId" = $${columns.length + 2} and id = $${columns.length + 3}
     returning ${SCHEDULE_COLUMNS}`,
    [...values, user.tenantId, user.id, id],
  );
}

export async function deleteReportScheduleForTenant(user: TenantUser, id: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  await execute('delete from "ReportSchedule" where "tenantId" = $1 and "userId" = $2 and id = $3', [user.tenantId, user.id, id]);
}

// Retry state (retryCount/nextRetryAt) is separate from lastRunAt/nextRunAt -- a schedule's
// normal cadence keeps advancing regardless of a failure; retry is a sooner-than-cadence extra
// attempt layered on top, not a replacement for the normal run.
function nextRetryState(delivery: { status: string; error?: string | null }, previousRetryCount: number, now: Date) {
  if (delivery.status !== "FAILED" || !isRetryableGenerationError(delivery.error)) {
    return { retryCount: 0, nextRetryAt: null as string | null };
  }
  const nextCount = previousRetryCount + 1;
  if (nextCount > REPORT_RETRY_BACKOFF_MINUTES.length) {
    // Retries exhausted -- give up until the schedule's own next natural cadence instead.
    return { retryCount: 0, nextRetryAt: null as string | null };
  }
  const backoffMinutes = REPORT_RETRY_BACKOFF_MINUTES[nextCount - 1];
  return { retryCount: nextCount, nextRetryAt: new Date(now.getTime() + backoffMinutes * 60_000).toISOString() };
}

// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers due
// schedules across every tenant at once.
export async function processDueReportSchedules(now = new Date()) {
  const schedules = await queryAsSystem<any>(
    `select ${SCHEDULE_COLUMNS}
     from "ReportSchedule"
     where "isActive" = true and "nextRunAt" <= $1
     order by "nextRunAt" asc
     limit 50`,
    [now.toISOString()],
  );

  const processed = [];
  for (const schedule of schedules) {
    const user = await queryOne<any>(
      `select u.id, u.email, u.name, u."tenantId", u."roleId", r.permissions as "rolePermissions"
       from "User" u
       left join "Role" r on r.id = u."roleId" and r."tenantId" = u."tenantId"
       where u."tenantId" = $1 and u.id = $2
       limit 1`,
      [schedule.tenantId, schedule.userId],
    );
    if (!user) continue;

    // A tenant that disabled Reports after this schedule was already created --
    // deactivate rather than keep firing a report a disabled tenant no longer has
    // access to.
    if (!(await isFeatureEnabledForTenant(schedule.tenantId, "advancedReporting"))) {
      await execute('update "ReportSchedule" set "isActive" = false, "updatedAt" = $1 where id = $2', [now.toISOString(), schedule.id]);
      continue;
    }

    const tenantUser = { ...user, role: user.rolePermissions ? { permissions: user.rolePermissions } : null };
    const delivery = await createDelivery(tenantUser, schedule, now);
    const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth, now);
    const retryState = nextRetryState(delivery, schedule.retryCount ?? 0, now);
    await execute(
      `update "ReportSchedule"
       set "lastRunAt" = $1, "lastStatus" = $2, "nextRunAt" = $3, "retryCount" = $4, "nextRetryAt" = $5, "updatedAt" = $1
       where id = $6`,
      [now.toISOString(), delivery.status, nextRunAt.toISOString(), retryState.retryCount, retryState.nextRetryAt, schedule.id],
    );
    processed.push({ scheduleId: schedule.id, deliveryId: delivery.id, status: delivery.status });
  }

  return { processed };
}

// Gap checklist Module 17, item 19 ("scheduled extracts" -- automatic retry of a failed report
// generation). Worker-invoked recurring job, separate from processDueReportSchedules -- it
// scans schedules with pending retry state (retryCount > 0, past nextRetryAt) rather than due
// schedules, and never touches lastRunAt/nextRunAt, so a retry attempt has zero effect on the
// schedule's normal cadence.
// WP07 (F04): BACKGROUND_JOB, disposition B -- same reasoning as processDueReportSchedules above.
export async function retryFailedReportSchedules(now = new Date()) {
  const schedules = await queryAsSystem<any>(
    `select ${SCHEDULE_COLUMNS}
     from "ReportSchedule"
     where "isActive" = true and "retryCount" > 0 and "nextRetryAt" <= $1
     order by "nextRetryAt" asc
     limit 25`,
    [now.toISOString()],
  );

  const retried = [];
  for (const schedule of schedules) {
    const user = await queryOne<any>(
      `select u.id, u.email, u.name, u."tenantId", u."roleId", r.permissions as "rolePermissions"
       from "User" u
       left join "Role" r on r.id = u."roleId" and r."tenantId" = u."tenantId"
       where u."tenantId" = $1 and u.id = $2
       limit 1`,
      [schedule.tenantId, schedule.userId],
    );
    if (!user) continue;

    if (!(await isFeatureEnabledForTenant(schedule.tenantId, "advancedReporting"))) {
      await execute('update "ReportSchedule" set "retryCount" = 0, "nextRetryAt" = null, "updatedAt" = $1 where id = $2', [now.toISOString(), schedule.id]);
      continue;
    }

    const tenantUser = { ...user, role: user.rolePermissions ? { permissions: user.rolePermissions } : null };
    const delivery = await createDelivery(tenantUser, schedule, now);
    const retryState = nextRetryState(delivery, schedule.retryCount, now);
    await execute(
      `update "ReportSchedule"
       set "lastStatus" = $1, "retryCount" = $2, "nextRetryAt" = $3, "updatedAt" = $4
       where id = $5`,
      [delivery.status, retryState.retryCount, retryState.nextRetryAt, now.toISOString(), schedule.id],
    );
    retried.push({ scheduleId: schedule.id, deliveryId: delivery.id, status: delivery.status });
  }

  return { retried };
}

function normalizeRecipients(recipients: string[] | undefined, fallbackEmail?: string | null) {
  const values = recipients?.length ? recipients : fallbackEmail ? [fallbackEmail] : [];
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => value.includes("@")))];
}

function computeNextRun(frequency: string, dayOfWeek?: number | null, dayOfMonth?: number | null, from = new Date()) {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  if (frequency === "DAILY") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (frequency === "MONTHLY") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(Math.min(Math.max(dayOfMonth ?? next.getUTCDate(), 1), 28));
    return next;
  }
  const targetDay = Math.min(Math.max(dayOfWeek ?? next.getUTCDay(), 0), 6);
  const delta = ((targetDay - next.getUTCDay() + 7) % 7) || 7;
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

async function renderScheduledReport(user: TenantUser & { role?: any }, reportKey: string, queryDefinition?: Record<string, unknown> | null) {
  if (queryDefinition?.root && Array.isArray((queryDefinition as any).fields)) {
    const { executeReportQueryForTenant } = await import("@/lib/server/reporting-query");
    return executeReportQueryForTenant(user, queryDefinition as any);
  }

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

async function insertDelivery(schedule: any, input: { subject: string; body: Record<string, unknown>; status: "PENDING" | "FAILED"; error?: string | null; exportRequestId?: string | null }, now: Date) {
  const row = await queryOne<{ id: string; status: string; error: string | null }>(
    `insert into "ReportEmailDelivery"
      (id, "tenantId", "scheduleId", "reportKey", recipients, subject, body, format, status, error, "exportRequestId", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning id, status, error`,
    [
      randomUUID(),
      schedule.tenantId,
      schedule.id,
      schedule.reportKey,
      schedule.recipients,
      input.subject,
      input.body,
      schedule.format,
      input.status,
      input.error ?? null,
      input.exportRequestId ?? null,
      now.toISOString(),
    ],
  );
  if (!row) throw new Error("REPORT_DELIVERY_INSERT_FAILED");
  return row;
}

// Queues one real EMAIL per recipient through the existing communications outbox
// (queueCommunicationForTenant) -- the same pipe every other outbound email in this app goes
// through, so suppression/consent/throttle checks apply here too, and actual SMTP dispatch,
// retry-with-backoff, and failure tracking come from processCommunicationOutbox unchanged
// rather than a second retry mechanism built just for this. A failure queueing for one
// recipient doesn't block the others.
async function queueDeliveryEmails(schedule: any, subject: string, body: string) {
  const failures: string[] = [];
  for (const recipient of schedule.recipients as string[]) {
    try {
      await queueCommunicationForTenant(
        { id: schedule.userId, tenantId: schedule.tenantId },
        { channel: "EMAIL", recipient, subject, body, sourceType: "REPORT_SCHEDULE", sourceId: schedule.id },
      );
    } catch {
      failures.push(recipient);
    }
  }
  return failures;
}

async function createDelivery(user: TenantUser, schedule: any, now: Date) {
  const subject = `Scheduled CRM report: ${schedule.reportKey}`;

  if (schedule.format === "CSV" || schedule.format === "XLSX" || schedule.format === "PDF") {
    if (!FILE_EXPORTABLE_REPORT_KEYS.has(schedule.reportKey)) {
      return insertDelivery(
        schedule,
        { subject, body: { note: `${schedule.format} export isn't available for this report yet.` }, status: "FAILED", error: `${schedule.format}_EXPORT_NOT_AVAILABLE` },
        now,
      );
    }
    let exportRequest;
    try {
      exportRequest = await createExportRequestForUser(user, {
        moduleName: "REPORTS",
        filters: { reportKind: "INBUILT", reportKey: schedule.reportKey },
        exportType: schedule.format,
      });
      if (exportRequest?.status === "QUEUED") exportRequest = await processExportRequest(exportRequest.id);
    } catch (error) {
      return insertDelivery(
        schedule,
        { subject, body: {}, status: "FAILED", error: error instanceof Error ? error.message : "Export failed" },
        now,
      );
    }
    if (exportRequest?.status === "PENDING_APPROVAL") {
      return insertDelivery(
        schedule,
        {
          subject,
          body: { note: "This report includes sensitive fields and is awaiting export approval before it can be sent." },
          status: "FAILED",
          error: "EXPORT_PENDING_APPROVAL",
          exportRequestId: exportRequest.id,
        },
        now,
      );
    }
    if (exportRequest?.status !== "COMPLETED") {
      return insertDelivery(
        schedule,
        { subject, body: {}, status: "FAILED", error: exportRequest?.error || "Export did not complete", exportRequestId: exportRequest?.id ?? null },
        now,
      );
    }

    const delivery = await insertDelivery(
      schedule,
      { subject, body: {}, status: "PENDING", exportRequestId: exportRequest.id },
      now,
    );
    const downloadUrl = `${getAppBaseUrl()}/api/public/report-deliveries/${delivery.id}/download`;
    const expiresAt = (exportRequest as any).expiresAt as string | null | undefined;
    const expiryNote = expiresAt ? ` This link expires on ${new Date(expiresAt).toDateString()}.` : "";
    const body = `Your scheduled report "${schedule.reportKey}" is ready. Download it here: ${downloadUrl}${expiryNote}`;
    const failedRecipients = await queueDeliveryEmails(schedule, subject, body);
    await execute(`update "ReportEmailDelivery" set body = $1 where id = $2`, [{ downloadUrl, failedRecipients }, delivery.id]);
    return { id: delivery.id, status: delivery.status, error: null };
  }

  // LINK format: no file to generate -- just a link back into the live, permissioned report
  // view, validated by actually resolving the report first so a stale/renamed reportKey
  // surfaces as a real delivery failure instead of emailing a dead link.
  try {
    await renderScheduledReport(user, schedule.reportKey, schedule.queryDefinition);
  } catch (error) {
    return insertDelivery(
      schedule,
      { subject, body: {}, status: "FAILED", error: error instanceof Error ? error.message : "Failed to render report" },
      now,
    );
  }
  const delivery = await insertDelivery(schedule, { subject, body: {}, status: "PENDING" }, now);
  const viewUrl = `${getAppBaseUrl()}/dashboard/reports?report=${encodeURIComponent(schedule.reportKey)}`;
  const body = `Your scheduled report "${schedule.reportKey}" is ready to view: ${viewUrl}`;
  const failedRecipients = await queueDeliveryEmails(schedule, subject, body);
  await execute(`update "ReportEmailDelivery" set body = $1 where id = $2`, [{ viewUrl, failedRecipients }, delivery.id]);
  return { id: delivery.id, status: delivery.status, error: null };
}

// Backs the public, unauthenticated download route (src/app/api/public/report-deliveries/
// [deliveryId]/download) -- reached from a scheduled-report email sent to a recipient who may
// not be an authenticated CRM user at all. Identified solely by the ReportEmailDelivery row id
// (unguessable, one-per-send), mirroring getExportDownloadForUser's completion/expiry checks
// exactly but scoped by delivery id instead of an authenticated user+tenant pair.
export async function getReportDeliveryDownload(deliveryId: string) {
  const row = await queryOne<{
    id: string;
    tenantId: string;
    scheduleUserId: string;
    exportRequestId: string | null;
    exportStatus: string | null;
    expiresAt: string | null;
    storageKey: string | null;
    originalFilename: string | null;
    contentType: string | null;
  }>(
    `select d.id, d."tenantId", d."exportRequestId", s."userId" as "scheduleUserId",
            er.status as "exportStatus", er."expiresAt", fo."storageKey", fo."originalFilename", fo."contentType"
     from "ReportEmailDelivery" d
     join "ReportSchedule" s on s.id = d."scheduleId"
     left join "ExportRequest" er on er.id = d."exportRequestId"
     left join "FileObject" fo on fo.id = er."fileObjectId"
     where d.id = $1
     limit 1`,
    [deliveryId],
  );
  if (!row) throw new Error("REPORT_DELIVERY_NOT_FOUND");
  if (!row.exportRequestId) throw new Error("REPORT_DELIVERY_HAS_NO_FILE");
  if (row.exportStatus === "EXPIRED" || (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now())) throw new Error("REPORT_DELIVERY_EXPIRED");
  if (row.exportStatus !== "COMPLETED" || !row.storageKey) throw new Error("REPORT_DELIVERY_NOT_READY");

  const buffer = await readPrivateFile(row.storageKey);
  await createAuditLog(
    { id: row.scheduleUserId, tenantId: row.tenantId },
    "DOWNLOAD",
    "REPORT_EMAIL_DELIVERY",
    deliveryId,
    null,
    { filename: row.originalFilename },
    null,
  ).catch(() => undefined);
  return {
    filename: row.originalFilename || `report-${deliveryId}.csv`,
    contentType: row.contentType || "text/csv; charset=utf-8",
    buffer,
  };
}
