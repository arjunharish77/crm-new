// Tenant module dependency rules. Shared by the server (enforcement) and the platform-admin UI
// (explanations), so both always agree. Only real code-level dependencies belong here:
//   * Journey Orchestration runs on the Automations engine and sends through Marketing
//     Communications (marketing-journeys.ts).
//   * Payouts are calculated and paid per partner (commission.ts, payouts.ts).
// Applications only optionally link to an Opportunity, so Product Catalog has no hard dependency.
//
// Policy (confirmed 2026-09-29): a change that would break a dependency is refused with an
// explanation. Nothing is ever enabled or disabled implicitly.
export const MODULE_DEPENDENCIES: Record<string, readonly string[]> = {
  JOURNEY_ORCHESTRATION: ["AUTOMATIONS", "MARKETING"],
  PAYOUTS: ["PARTNERS"],
};

/**
 * Effective on/off per module key (module entitlement combined with any overlapping feature flag).
 * A key that is absent is not in this tenant's catalog and cannot be switched off, so it never
 * counts as a missing requirement -- only an explicit `false` does.
 */
export type ModuleStates = Record<string, boolean>;
type NameLookup = (moduleKey: string) => string;

export function requiredModules(moduleKey: string): readonly string[] {
  return MODULE_DEPENDENCIES[moduleKey] ?? [];
}

export function dependentModules(moduleKey: string): string[] {
  return Object.entries(MODULE_DEPENDENCIES)
    .filter(([, required]) => required.includes(moduleKey))
    .map(([dependent]) => dependent);
}

function list(keys: string[], name: NameLookup) {
  return keys.map(name).join(" and ");
}

/**
 * Why turning `moduleKey` on or off is not allowed given the current states, or null if it is.
 * Enabling needs every required module on; disabling needs every dependent module already off.
 */
export function moduleChangeBlockedReason(states: ModuleStates, moduleKey: string, enable: boolean, name: NameLookup = (key) => key) {
  if (enable) {
    const missing = requiredModules(moduleKey).filter((key) => states[key] === false);
    return missing.length ? `${name(moduleKey)} requires ${list(missing, name)}. Enable ${list(missing, name)} first.` : null;
  }
  const blocking = dependentModules(moduleKey).filter((key) => states[key] === true);
  return blocking.length ? `${list(blocking, name)} depends on ${name(moduleKey)}. Disable ${list(blocking, name)} first.` : null;
}

/** Existing combinations that already violate a dependency (e.g. created before these rules). */
export function dependencyViolations(states: ModuleStates, name: NameLookup = (key) => key) {
  return Object.entries(MODULE_DEPENDENCIES).flatMap(([moduleKey, required]) => {
    if (states[moduleKey] !== true) return [];
    const missing = required.filter((key) => states[key] === false);
    return missing.length ? [{ moduleKey, missing, message: `${name(moduleKey)} won't work: ${list(missing, name)} ${missing.length > 1 ? "are" : "is"} disabled.` }] : [];
  });
}
