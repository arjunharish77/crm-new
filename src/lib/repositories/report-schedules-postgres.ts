import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = {
  id: string;
  tenantId: string | null;
  email?: string | null;
};

type ScheduleInput = {
  reportKey?: string;
  queryDefinition?: Record<string, unknown> | null;
  recipients?: string[];
  format?: "LINK" | "CSV" | "PDF";
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  nextRunAt?: string | null;
  isActive?: boolean;
};

const SCHEDULE_COLUMNS =
  'id, "tenantId", "userId", "reportKey", "queryDefinition", recipients, format, frequency, "dayOfWeek", "dayOfMonth", "nextRunAt", "lastRunAt", "lastStatus", "isActive", "createdAt", "updatedAt"';

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
  await execute('delete from "ReportSchedule" where "tenantId" = $1 and "userId" = $2 and id = $3', [user.tenantId, user.id, id]);
}

export async function processDueReportSchedules(now = new Date()) {
  const schedules = await query<any>(
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

    const report = await renderScheduledReport(
      { ...user, role: user.rolePermissions ? { permissions: user.rolePermissions } : null },
      schedule.reportKey,
      schedule.queryDefinition,
    );
    const delivery = await createDelivery(schedule, report, now);
    const nextRunAt = computeNextRun(schedule.frequency, schedule.dayOfWeek, schedule.dayOfMonth, now);
    await execute(
      `update "ReportSchedule"
       set "lastRunAt" = $1, "lastStatus" = $2, "nextRunAt" = $3, "updatedAt" = $1
       where id = $4`,
      [now.toISOString(), delivery.status, nextRunAt.toISOString(), schedule.id],
    );
    processed.push({ scheduleId: schedule.id, deliveryId: delivery.id, status: delivery.status });
  }

  return { processed };
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

async function createDelivery(schedule: any, report: any, now: Date) {
  const row = await queryOne<{ id: string; status: string }>(
    `insert into "ReportEmailDelivery"
      (id, "tenantId", "scheduleId", "reportKey", recipients, subject, body, format, status, "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
     returning id, status`,
    [
      randomUUID(),
      schedule.tenantId,
      schedule.id,
      schedule.reportKey,
      schedule.recipients,
      `Scheduled CRM report: ${schedule.reportKey}`,
      { report, note: "Mail transport is not configured; this row is ready for a future email adapter." },
      schedule.format,
      now.toISOString(),
    ],
  );
  if (!row) throw new Error("REPORT_DELIVERY_INSERT_FAILED");
  return row;
}
