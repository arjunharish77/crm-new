import { randomUUID } from "crypto";
import type { QueryResultRow } from "pg";
import { query, queryOne } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";
import { dependencyViolations, dependentModules, moduleChangeBlockedReason, type ModuleStates } from "@/lib/module-dependencies";
import { MODULE_FEATURE_KEYS, type TenantFeatureKey } from "@/lib/tenant-provisioning";
import { pauseModuleWork, restoreModuleWork } from "@/lib/server/module-lifecycle";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isPlatformAdmin?: boolean;
};

export type ModuleStatus = "ENABLED" | "DISABLED" | "SUSPENDED" | "TRIAL";

const MODULE_COLUMNS = `id, "tenantId", "moduleKey", status, reason, "effectiveAt", "updatedBy", "createdAt", "updatedAt", "trialEndsAt"`;

export async function getModuleCatalog() {
  return query<any>(`select "key", name, description, category, "isCore" from "PlatformModule" order by category, name`, []);
}

export async function getTenantModuleEntitlements(tenantId: string) {
  const [catalog, entitlements, paused] = await Promise.all([
    getModuleCatalog(),
    query<any>(`select ${MODULE_COLUMNS} from "TenantModuleEntitlement" where "tenantId" = $1`, [tenantId]),
    query<{ moduleKey: string; count: number }>(`select "moduleKey", count(*)::int as count from "ModulePausedItem" where "tenantId" = $1 and "restoredAt" is null group by "moduleKey"`, [tenantId]),
  ]);
  const pausedByKey = new Map(paused.map((row) => [row.moduleKey, row.count]));
  const entitlementByKey = new Map(entitlements.map((row) => [row.moduleKey, row]));
  // A module with no explicit row defaults to ENABLED -- matches the same "missing ->
  // enabled" convention already established by TenantFeature's DEFAULT_TENANT_FEATURE_FLAGS,
  // so introducing a new module never silently locks out existing tenants.
  return catalog.map((catalogEntry) => ({
    ...catalogEntry,
    status: (entitlementByKey.get(catalogEntry.key)?.status as ModuleStatus) ?? "ENABLED",
    reason: entitlementByKey.get(catalogEntry.key)?.reason ?? null,
    trialEndsAt: entitlementByKey.get(catalogEntry.key)?.trialEndsAt ?? null,
    // Live items this module paused when it was switched off; restored when it is switched on.
    pausedCount: pausedByKey.get(catalogEntry.key) ?? 0,
    updatedAt: entitlementByKey.get(catalogEntry.key)?.updatedAt ?? null,
  }));
}

export async function isModuleEnabledForTenant(tenantId: string | null | undefined, moduleKey: string): Promise<boolean> {
  if (!tenantId) return false;
  const row = await queryOne<{ status: ModuleStatus }>(
    `select status from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = $2 limit 1`,
    [tenantId, moduleKey],
  );
  if (!row?.status) return true; // no explicit row (or no status) -> defaults enabled
  return row.status === "ENABLED" || row.status === "TRIAL";
}

/** assertModuleEnabled for a request user (platform admins bypass, matching the rest of the app). */
export async function assertTenantModule(user: { tenantId?: string | null; isPlatformAdmin?: boolean }, moduleKey: string) {
  return assertModuleEnabled(user.tenantId, moduleKey, { isPlatformAdmin: user.isPlatformAdmin });
}

export async function assertModuleEnabled(
  tenantId: string | null | undefined,
  moduleKey: string,
  opts: { isPlatformAdmin?: boolean } = {}
) {
  if (opts.isPlatformAdmin) return;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  if (!(await isModuleEnabledForTenant(tenantId, moduleKey))) throw new Error(`MODULE_DISABLED:${moduleKey}`);
}

const ENABLED_STATUSES = new Set<string>(["ENABLED", "TRIAL"]);

async function rows<T extends QueryResultRow>(tx: TransactionClient | undefined, sql: string, params: unknown[]): Promise<T[]> {
  return tx ? ((await tx.query(sql, params)).rows as T[]) : query<T>(sql, params);
}

/**
 * Effective on/off state of every catalog module for a tenant: its entitlement (no row = enabled)
 * AND, for the six modules that also have a legacy feature flag, that flag (no TenantFeature row
 * = the documented defaults, all of which are on for these six). This is the same rule the
 * runtime gates apply (entitlements.ts / effectiveTenantFeatures), so dependency checks agree
 * with what users actually experience.
 */
export async function getEffectiveModuleStates(tenantId: string, tx?: TransactionClient) {
  const reads = [
    () => rows<{ key: string; name: string }>(tx, `select "key", name from "PlatformModule"`, []),
    () => rows<{ moduleKey: string; status: string }>(tx, `select "moduleKey", status from "TenantModuleEntitlement" where "tenantId" = $1`, [tenantId]),
  ] as const;
  // One pg client runs one query at a time (concurrent calls on a client are deprecated in pg), so
  // inside a transaction read sequentially; outside one, the pool can serve them in parallel.
  const [catalog, entitlements] = tx
    ? [await reads[0](), await reads[1]()]
    : await Promise.all([reads[0](), reads[1]()]);
  const statusByKey = new Map(entitlements.map((row) => [row.moduleKey, row.status]));
  const states: ModuleStates = {};
  const names: Record<string, string> = {};
  // The module entitlement alone decides (decision 15, migration 0126): the six feature flags
  // that overlapped a module are no longer read.
  for (const entry of catalog) {
    names[entry.key] = entry.name;
    const status = statusByKey.get(entry.key);
    states[entry.key] = status === undefined || ENABLED_STATUSES.has(status);
  }
  return {
    states,
    names,
    entitled: (key: string) => { const status = statusByKey.get(key); return status === undefined || ENABLED_STATUSES.has(status); },
    // Kept for callers written when a feature flag could also switch a module off; always on now.
    flagOn: (_key: string) => true,
  };
}

export class ModuleDependencyError extends Error {
  constructor(readonly explanation: string) {
    super(`MODULE_DEPENDENCY: ${explanation}`);
  }
}

// Serializes every entitlement/overlapping-flag change for one tenant, so two platform admins
// changing dependent modules at the same moment cannot both pass the dependency check.
export async function lockTenantModules(tx: TransactionClient, tenantId: string) {
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`tenant-modules:${tenantId}`]);
}

// Platform-admin only -- a tenant admin cannot self-enable/disable a module (matches the
// checklist's "tenant users cannot self-enable paid/restricted modules" requirement).
export async function setTenantModuleStatus(
  platformAdminUser: TenantUser,
  tenantId: string,
  moduleKey: string,
  status: ModuleStatus,
  reason?: string | null,
  options: { trialEndsAt?: string | null } = {},
) {
  // A trial must end: TRIAL requires a future end date; any other status clears it.
  let trialEndsAt: string | null = null;
  if (status === "TRIAL") {
    const end = options.trialEndsAt ? new Date(options.trialEndsAt) : null;
    if (!end || Number.isNaN(end.getTime()) || end.getTime() <= Date.now()) throw new Error("TRIAL_END_DATE_REQUIRED");
    trialEndsAt = end.toISOString();
  }
  return withTransaction(null, async (tx) => {
    await lockTenantModules(tx, tenantId);
    const catalogEntry = (await tx.query<{ key: string; isCore: boolean }>(`select "key", "isCore" from "PlatformModule" where "key" = $1 limit 1`, [moduleKey])).rows[0];
    if (!catalogEntry) throw new Error("MODULE_NOT_FOUND");
    if (catalogEntry.isCore && status !== "ENABLED") throw new Error("CORE_MODULE_CANNOT_BE_DISABLED");

    const { states, names, flagOn } = await getEffectiveModuleStates(tenantId, tx);
    const blocked = moduleChangeBlockedReason(states, moduleKey, ENABLED_STATUSES.has(status), (key) => names[key] ?? key);
    if (blocked) throw new ModuleDependencyError(blocked);

    const auditAction = status === "ENABLED" ? "ENABLED" : status === "DISABLED" ? "DISABLED" : status === "SUSPENDED" ? "SUSPENDED" : "TRIAL_STARTED";
    await writeEntitlement(tx, tenantId, moduleKey, status, reason ?? null, platformAdminUser.id, auditAction, trialEndsAt);
    const lifecycle = await applyLifecycle(tx, tenantId, moduleKey, states[moduleKey], ENABLED_STATUSES.has(status) && flagOn(moduleKey));
    return { moduleKey, status, trialEndsAt, ...lifecycle };
  });
}

/** Also used by module-emergency.ts; callers must hold lockTenantModules. */
export async function writeEntitlement(
  tx: TransactionClient,
  tenantId: string,
  moduleKey: string,
  status: ModuleStatus,
  reason: string | null,
  actorId: string | null,
  auditAction: string,
  trialEndsAt: string | null,
) {
  const now = new Date().toISOString();
  // One atomic upsert against the ("tenantId", "moduleKey") unique constraint (a select-then-
  // insert would race); callers also hold the tenant module lock. Changing the trial end date
  // re-arms the 7-day warning.
  await tx.query(
    `insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status, reason, "effectiveAt", "updatedBy", "createdAt", "updatedAt", "trialEndsAt", "trialWarningSentAt")
     values ($1, $2, $3, $4, $5, $6, $7, $6, $6, $8, null)
     on conflict ("tenantId", "moduleKey") do update
       set status = excluded.status, reason = excluded.reason, "updatedBy" = excluded."updatedBy", "updatedAt" = excluded."updatedAt",
           "trialEndsAt" = excluded."trialEndsAt",
           "trialWarningSentAt" = case when "TenantModuleEntitlement"."trialEndsAt" is not distinct from excluded."trialEndsAt" then "TenantModuleEntitlement"."trialWarningSentAt" end`,
    [randomUUID(), tenantId, moduleKey, status, reason, now, actorId, trialEndsAt],
  );
  await tx.query(
    `insert into "TenantModuleAuditLog" (id, "tenantId", "moduleKey", action, reason, "performedBy", "performedAt") values ($1, $2, $3, $4, $5, $6, $7)`,
    [randomUUID(), tenantId, moduleKey, auditAction, reason, actorId, now],
  );
}

// Effective on -> off pauses the module's live work; off -> on restores what it paused.
export async function applyLifecycle(tx: TransactionClient, tenantId: string, moduleKey: string, wasOn: boolean | undefined, isOn: boolean) {
  if (wasOn !== false && !isOn) return { paused: await pauseModuleWork(tx, tenantId, moduleKey), restored: 0 };
  if (wasOn === false && isOn) return { paused: 0, restored: (await restoreModuleWork(tx, tenantId, moduleKey)).restored };
  return { paused: 0, restored: 0 };
}

/** Dependency problems already present for a tenant (e.g. configured before these rules existed). */
export async function getTenantModuleDependencyWarnings(tenantId: string) {
  const { states, names } = await getEffectiveModuleStates(tenantId);
  return dependencyViolations(states, (key) => names[key] ?? key);
}

export async function listTenantModuleAuditLog(tenantId: string) {
  return query<any>(
    `select id, "moduleKey", action, reason, "performedBy", "performedAt" from "TenantModuleAuditLog"
     where "tenantId" = $1 order by "performedAt" desc limit 200`,
    [tenantId],
  );
}

// ---------------------------------------------------------------------------------------------
// Trials (decision confirmed 2026-09-29): a 7-day warning to platform admins and the tenant's
// admins, then at the end date the module is SUSPENDED with its data kept and live work paused.
// Any enabled module that depends on it is suspended with it and audited as such, because it
// cannot work without its requirement (the manual "never cascade" rule cannot apply to an
// unattended expiry).

const TRIAL_WARNING_DAYS = 7;
const possessive = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

async function recipientsForTenant(tx: TransactionClient, tenantId: string) {
  const platformAdmins = (await tx.query<{ userId: string }>(`select "userId" from "PlatformAdmin" where "isActive" = true`, [])).rows.map((row) => row.userId);
  const tenantAdmins = (await tx.query<{ id: string }>(
    `select u.id from "User" u join "Role" r on r.id = u."roleId"
     where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
       and (r.permissions -> 'modules' ->> 'admin' = 'full' or r.permissions ->> 'recordAccess' = 'ALL')`,
    [tenantId],
  )).rows.map((row) => row.id);
  return { platformAdmins, tenantAdmins };
}

async function notifyAll(userIds: { platformAdmins: string[]; tenantAdmins: string[] }, tenantId: string, title: string, message: string, data: Record<string, unknown>) {
  const { createUserNotification } = await import("@/lib/server/notifications");
  for (const userId of userIds.platformAdmins) await createUserNotification({ tenantId: null, userId, title, message, data }).catch(() => undefined);
  for (const userId of userIds.tenantAdmins) await createUserNotification({ tenantId, userId, title, message, data }).catch(() => undefined);
}

/** Worker job: send due trial warnings, then expire trials past their end date. */
export async function processModuleTrials(now = new Date()) {
  const warnBefore = new Date(now.getTime() + TRIAL_WARNING_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const due = await query<{ tenantId: string; moduleKey: string; trialEndsAt: string; trialWarningSentAt: string | null }>(
    `select "tenantId", "moduleKey", "trialEndsAt", "trialWarningSentAt" from "TenantModuleEntitlement"
     where status = 'TRIAL' and "trialEndsAt" is not null
       and ("trialEndsAt" <= $1 or ("trialEndsAt" <= $2 and "trialWarningSentAt" is null))
     order by "trialEndsAt" limit 200`,
    [now.toISOString(), warnBefore],
  );
  let warned = 0;
  let expired = 0;
  for (const row of due) {
    const outcome = await withTransaction(null, async (tx) => {
      await lockTenantModules(tx, row.tenantId);
      // Re-read under the lock: an admin may have converted or extended the trial meanwhile.
      const current = (await tx.query<{ status: string; trialEndsAt: string | null; trialWarningSentAt: string | null }>(
        `select status, "trialEndsAt", "trialWarningSentAt" from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = $2 for update`,
        [row.tenantId, row.moduleKey],
      )).rows[0];
      if (!current || current.status !== "TRIAL" || !current.trialEndsAt) return null;
      const { states, names } = await getEffectiveModuleStates(row.tenantId, tx);
      const name = (key: string) => names[key] ?? key;
      const dependents = dependentsToCascade(row.moduleKey, states);
      const recipients = await recipientsForTenant(tx, row.tenantId);

      if (new Date(current.trialEndsAt).getTime() <= now.getTime()) {
        await writeEntitlement(tx, row.tenantId, row.moduleKey, "SUSPENDED", "Trial expired", null, "TRIAL_EXPIRED", null);
        await applyLifecycle(tx, row.tenantId, row.moduleKey, states[row.moduleKey], false);
        for (const dependent of dependents) {
          const reason = `Suspended because ${possessive(name(row.moduleKey))} trial expired`;
          await writeEntitlement(tx, row.tenantId, dependent, "SUSPENDED", reason, null, "DEPENDENCY_SUSPENDED", null);
          await applyLifecycle(tx, row.tenantId, dependent, states[dependent], false);
        }
        const also = dependents.length ? ` ${dependents.map(name).join(" and ")} ${dependents.length > 1 ? "were" : "was"} suspended with it because ${dependents.length > 1 ? "they depend" : "it depends"} on it.` : "";
        await notifyAll(recipients, row.tenantId, `${name(row.moduleKey)} trial ended`, `The ${name(row.moduleKey)} trial has ended and the module is suspended. Data is kept and scheduled work is paused until it is enabled.${also}`, { moduleKey: row.moduleKey, dependents, event: "MODULE_TRIAL_EXPIRED" });
        return "expired";
      }
      if (!current.trialWarningSentAt) {
        const endsOn = new Date(current.trialEndsAt).toISOString().slice(0, 10);
        const also = dependents.length ? ` ${dependents.map(name).join(" and ")} will be suspended with it because ${dependents.length > 1 ? "they depend" : "it depends"} on it.` : "";
        await notifyAll(recipients, row.tenantId, `${name(row.moduleKey)} trial ends ${endsOn}`, `The ${name(row.moduleKey)} trial ends on ${endsOn}. After that the module is suspended (data kept, scheduled work paused) unless a platform admin enables it.${also}`, { moduleKey: row.moduleKey, dependents, trialEndsAt: current.trialEndsAt, event: "MODULE_TRIAL_ENDING" });
        await tx.query(`update "TenantModuleEntitlement" set "trialWarningSentAt" = now() where "tenantId" = $1 and "moduleKey" = $2`, [row.tenantId, row.moduleKey]);
        return "warned";
      }
      return null;
    });
    if (outcome === "expired") expired++;
    if (outcome === "warned") warned++;
  }
  return { warned, expired };
}

// Enabled modules that (directly or transitively) require `moduleKey`.
export function dependentsToCascade(moduleKey: string, states: ModuleStates) {
  const result: string[] = [];
  const queue = [moduleKey];
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of dependentModules(current)) {
      if (states[dependent] === true && !result.includes(dependent)) {
        result.push(dependent);
        queue.push(dependent);
      }
    }
  }
  return result;
}
