import * as pgDedupe from "@/lib/repositories/dedupe-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
};

type EntityType = "LEAD" | "OPPORTUNITY" | "CASE";

export async function listDedupeMatchRulesForTenant(user: TenantUser) {
  return pgDedupe.listDedupeMatchRulesForTenant(user);
}

export async function updateDedupeMatchRuleForTenant(user: TenantUser, id: string, input: { isActive?: boolean; threshold?: number | null }) {
  return pgDedupe.updateDedupeMatchRuleForTenant(user, id, input);
}

export async function runDedupeScanForTenant(user: TenantUser, entityType: EntityType, limit?: number) {
  return pgDedupe.runDedupeScanForTenant(user, entityType, limit);
}

export async function listDedupeMatchesForTenant(user: TenantUser, entityType: EntityType, status?: "PENDING" | "MERGED" | "DISMISSED") {
  return pgDedupe.listDedupeMatchesForTenant(user, entityType, status);
}

export async function dismissDedupeMatchForTenant(user: TenantUser, matchId: string) {
  return pgDedupe.dismissDedupeMatchForTenant(user, matchId);
}

export async function mergeRecordsForTenant(user: TenantUser, input: { matchId: string; survivorId: string; fieldChoices?: Record<string, unknown> }) {
  return pgDedupe.mergeRecordsForTenant(user, input);
}

export async function unmergeForTenant(user: TenantUser, mergeAuditId: string) {
  return pgDedupe.unmergeForTenant(user, mergeAuditId);
}

export async function listMergeAuditsForTenant(user: TenantUser, entityType: EntityType) {
  return pgDedupe.listMergeAuditsForTenant(user, entityType);
}
