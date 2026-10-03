import * as pgReportRollups from "@/lib/repositories/report-rollups-postgres";
import { assertFeatureEnabled } from "@/lib/server/entitlements";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
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
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  return pgReportRollups.requestReportRollupRefresh(user, input);
}

export async function refreshReportRollupForTenant(user: TenantUser, input: RefreshInput) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  return pgReportRollups.refreshReportRollupForTenant(user, input);
}

export async function processPendingReportRefreshJobs(limit = 25) {
  return pgReportRollups.processPendingReportRefreshJobs(limit);
}

export async function listReportRefreshStatesForTenant(user: TenantUser) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  return pgReportRollups.listReportRefreshStatesForTenant(user);
}

export async function updateReportRefreshPolicyForTenant(
  user: TenantUser,
  input: { reportKey: string; scopeType?: "ORG" | "TEAM" | "USER" | "PARTNER"; scopeId?: string | null; refreshIntervalMinutes: number },
) {
  await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
  return pgReportRollups.updateReportRefreshPolicyForTenant(user, input);
}

export async function processDueReportRollupRefreshes(limit = 50) {
  return pgReportRollups.processDueReportRollupRefreshes(limit);
}

export async function invalidateReportRollupsForTenant(tenantId: string | null | undefined) {
  return pgReportRollups.invalidateReportRollupsForTenant(tenantId);
}
