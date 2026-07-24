import * as pgReportSchedules from "@/lib/repositories/report-schedules-postgres";

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

export async function listReportSchedulesForTenant(user: TenantUser) {
  return pgReportSchedules.listReportSchedulesForTenant(user);
}

export async function createReportScheduleForTenant(user: TenantUser, input: ScheduleInput) {
  return pgReportSchedules.createReportScheduleForTenant(user, input);
}

export async function updateReportScheduleForTenant(user: TenantUser, id: string, input: ScheduleInput) {
  return pgReportSchedules.updateReportScheduleForTenant(user, id, input);
}

export async function deleteReportScheduleForTenant(user: TenantUser, id: string) {
  return pgReportSchedules.deleteReportScheduleForTenant(user, id);
}

export async function processDueReportSchedules(now = new Date()) {
  return pgReportSchedules.processDueReportSchedules(now);
}
