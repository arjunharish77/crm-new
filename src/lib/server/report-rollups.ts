import * as pgReportRollups from "@/lib/repositories/report-rollups-postgres";

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

export async function requestReportRollupRefresh(user: TenantUser, input: RefreshInput) {
  return pgReportRollups.requestReportRollupRefresh(user, input);
}

export async function refreshReportRollupForTenant(user: TenantUser, input: RefreshInput) {
  return pgReportRollups.refreshReportRollupForTenant(user, input);
}

export async function processPendingReportRefreshJobs(limit = 25) {
  return pgReportRollups.processPendingReportRefreshJobs(limit);
}
