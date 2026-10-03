import * as pgRetention from "@/lib/repositories/retention-postgres";

export async function listDataRetentionPoliciesForPlatformAdmin() {
  return pgRetention.listDataRetentionPoliciesForPlatformAdmin();
}

export async function getOrCreateDataRetentionPolicyForTenantId(tenantId: string) {
  return pgRetention.getOrCreateDataRetentionPolicyForTenantId(tenantId);
}

export async function updateDataRetentionPolicyForTenantId(tenantId: string, input: Record<string, number | string | null>) {
  return pgRetention.updateDataRetentionPolicyForTenantId(tenantId, input);
}

export async function processDueDataRetentionEnforcement(limit?: number, options?: { all?: boolean }) {
  return pgRetention.processDueDataRetentionEnforcement(limit, options);
}

export async function previewAllDataRetention() {
  return pgRetention.previewAllDataRetention();
}
