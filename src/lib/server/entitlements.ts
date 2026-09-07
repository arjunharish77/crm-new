import { getTenantFeatureFlags } from "@/lib/server/admin";

export type EntitlementFeature =
  | "payoutsEnabled"
  | "gamificationEnabled"
  | "opportunityEnabled"
  | "automationEnabled"
  | "formBuilderEnabled"
  | "advancedReporting"
  | "apiAccessEnabled";

// Single choke point for the "is this whole module even entitled for this tenant"
// check -- called from the core payout/gamification server functions (not just their
// API routes) so worker processors and automation-action nodes that invoke those
// functions directly, bypassing HTTP, are covered by the same gate.
export async function isFeatureEnabledForTenant(tenantId: string | null | undefined, feature: EntitlementFeature) {
  if (!tenantId) return false;
  const flags = await getTenantFeatureFlags(tenantId);
  return flags[feature] !== false;
}

// Platform admins bypass everywhere else in the app (feature-gate.tsx) and do so here
// too, since they need to be able to inspect/support a tenant regardless of its plan.
export async function assertFeatureEnabled(
  tenantId: string | null | undefined,
  feature: EntitlementFeature,
  opts: { isPlatformAdmin?: boolean } = {}
) {
  if (opts.isPlatformAdmin) return;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!(await isFeatureEnabledForTenant(tenantId, feature))) throw new Error(`FEATURE_DISABLED:${feature}`);
}
