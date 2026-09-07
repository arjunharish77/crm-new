import * as pgRetention from "@/lib/repositories/retention-postgres";

export async function listDataRetentionPoliciesForPlatformAdmin() {
  return pgRetention.listDataRetentionPoliciesForPlatformAdmin();
}

export async function getOrCreateDataRetentionPolicyForTenantId(tenantId: string) {
  return pgRetention.getOrCreateDataRetentionPolicyForTenantId(tenantId);
}

export async function updateDataRetentionPolicyForTenantId(tenantId: string, input: Record<string, number>) {
  return pgRetention.updateDataRetentionPolicyForTenantId(tenantId, input);
}

export async function processDueDataRetentionEnforcement(limit?: number) {
  return pgRetention.processDueDataRetentionEnforcement(limit);
}
