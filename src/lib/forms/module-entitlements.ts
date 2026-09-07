// Only Opportunities has a tenant-level "disabled" concept that the forms module needs
// to respect today -- Lead/Activity/Task have no TenantFeature flag (mirrors the same
// rule already established in smart-view-fields.ts). Don't invent entitlement flags for
// modules that don't have one.
export type FormSourceModule = "lead" | "opportunity" | "activity" | "task";

export function isFormModuleEnabled(module: FormSourceModule, features: { opportunityEnabled?: boolean }) {
  if (module === "opportunity") return features.opportunityEnabled !== false;
  return true;
}

// Placements that create/show Opportunity data -- hidden as form destinations when the
// tenant has Opportunities disabled, same idea as hiding the module from the field palette.
export const OPPORTUNITY_PLACEMENTS = ["OPPORTUNITY_DETAIL", "OPPORTUNITY_CREATE"] as const;

export function isPlacementEnabled(placement: string, features: { opportunityEnabled?: boolean }) {
  if ((OPPORTUNITY_PLACEMENTS as readonly string[]).includes(placement)) return features.opportunityEnabled !== false;
  return true;
}
