import { randomUUID } from "crypto";
import { queryAsSystem, queryOneAsSystem } from "@/lib/db/query";
import { withTransaction, type TransactionClient } from "@/lib/db/transaction";
import { moduleChangeBlockedReason, requiredModules } from "@/lib/module-dependencies";
import { applyLifecycle, dependentsToCascade, getEffectiveModuleStates, lockTenantModules, writeEntitlement } from "@/lib/server/module-entitlements";

// Emergency module suspension (Module 21 VPS runbook). A platform operator suspends one module for
// one tenant or every tenant, from the command line (scripts/module-emergency.ts), when a module
// misbehaves and the admin UI cannot be relied on. It goes through the same per-tenant module
// lock, entitlement write, audit log and pause-live-work lifecycle as a normal platform-admin
// change; additionally each tenant's previous status is recorded so lifting puts back exactly
// what was there -- and only where nobody changed the module in between. Dependents are never
// suspended silently: the operator must pass includeDependents, and they are recorded and lifted
// with the module.

export type EmergencyActor = { id: string; email: string };

export type SuspendOutcome = "SUSPENDED" | "ALREADY_OFF" | "ALREADY_IN_EMERGENCY" | "BLOCKED_BY_DEPENDENTS" | "FAILED";
export type LiftOutcome = "RESTORED" | "CHANGED_SINCE" | "TRIAL_ENDED" | "REQUIREMENT_OFF";

export type TenantSuspendResult = { tenantId: string; tenantName: string; outcome: SuspendOutcome; modules: string[]; pausedItems: number; detail?: string };
export type TenantLiftResult = { tenantId: string; tenantName: string; modules: { moduleKey: string; outcome: LiftOutcome; detail?: string }[]; restoredItems: number; failed?: string };

type EmergencyRow = { id: string; moduleKey: string; reason: string; tenantNotice: string | null; startedBy: string; startedAt: string };

class DryRunRollback<T> extends Error {
  constructor(readonly result: T) {
    super("DRY_RUN_ROLLBACK");
  }
}

/** Runs fn in a per-tenant transaction holding the tenant module lock; a dry run rolls it back. */
async function inTenantTransaction<T>(tenantId: string, dryRun: boolean, fn: (tx: TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(null, async (tx) => {
      await lockTenantModules(tx, tenantId);
      const result = await fn(tx);
      if (dryRun) throw new DryRunRollback(result);
      return result;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) return error.result as T;
    throw error;
  }
}

/** The operator must be an active platform admin; every change is attributed to them. */
export async function resolvePlatformAdminActor(email: string): Promise<EmergencyActor> {
  // Pre-auth style lookup by email across all users (no tenant context).
  const row = await queryOneAsSystem<{ id: string; email: string }>(
    `select u.id, u.email from "User" u join "PlatformAdmin" p on p."userId" = u.id
     where lower(u.email) = lower($1) and p."isActive" = true and u."deletedAt" is null limit 1`,
    [email.trim()],
  );
  if (!row) throw new Error("ACTOR_NOT_PLATFORM_ADMIN");
  return row;
}

async function assertSwitchableModule(moduleKey: string) {
  const row = await queryOneAsSystem<{ key: string; name: string; isCore: boolean }>(`select "key", name, "isCore" from "PlatformModule" where "key" = $1`, [moduleKey]);
  if (!row) throw new Error("MODULE_NOT_FOUND");
  if (row.isCore) throw new Error("CORE_MODULE_CANNOT_BE_DISABLED");
  return row;
}

async function selectTenants(tenantIds: string[] | "ALL") {
  // Platform operator action across tenants by design.
  const rows = tenantIds === "ALL"
    ? await queryAsSystem<{ id: string; name: string }>(`select id, name from "Tenant" order by name, id`, [])
    : await queryAsSystem<{ id: string; name: string }>(`select id, name from "Tenant" where id = any($1) order by name, id`, [tenantIds]);
  if (tenantIds !== "ALL") {
    const missing = tenantIds.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length) throw new Error(`TENANT_NOT_FOUND:${missing.join(",")}`);
  }
  return rows;
}

const openEmergencySql = `select id, "moduleKey", reason, "tenantNotice", "startedBy", "startedAt" from "ModuleEmergency" where "moduleKey" = $1 and "liftedAt" is null limit 1`;

async function notify(tenantId: string | null, userIds: string[], title: string, message: string, data: Record<string, unknown>) {
  const { createUserNotification } = await import("@/lib/server/notifications");
  for (const userId of userIds) await createUserNotification({ tenantId, userId, title, message, data }).catch(() => undefined);
}

async function tenantAdminIds(tenantId: string) {
  const rows = await queryAsSystem<{ id: string }>(
    `select u.id from "User" u join "Role" r on r.id = u."roleId"
     where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
       and (r.permissions -> 'modules' ->> 'admin' = 'full' or r.permissions ->> 'recordAccess' = 'ALL')`,
    [tenantId],
  );
  return rows.map((row) => row.id);
}

async function platformAdminIds() {
  return (await queryAsSystem<{ userId: string }>(`select "userId" from "PlatformAdmin" where "isActive" = true`, [])).map((row) => row.userId);
}

export async function suspendModuleEmergency(
  actor: EmergencyActor,
  input: { moduleKey: string; tenantIds: string[] | "ALL"; reason: string; tenantNotice?: string | null; includeDependents: boolean; dryRun: boolean },
) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("REASON_REQUIRED");
  const moduleRow = await assertSwitchableModule(input.moduleKey);
  const tenants = await selectTenants(input.tenantIds);

  // One open emergency per module; a re-run (e.g. after creating tenants) adds to it.
  let emergency = await queryOneAsSystem<EmergencyRow>(openEmergencySql, [input.moduleKey]);
  const reused = !!emergency;
  if (!emergency && !input.dryRun) {
    await queryAsSystem(
      `insert into "ModuleEmergency" (id, "moduleKey", reason, "tenantNotice", "startedBy") values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [randomUUID(), input.moduleKey, reason, input.tenantNotice?.trim() || null, actor.id],
    );
    emergency = await queryOneAsSystem<EmergencyRow>(openEmergencySql, [input.moduleKey]);
  }
  const emergencyId = emergency?.id ?? "dry-run";

  const results: TenantSuspendResult[] = [];
  for (const tenant of tenants) {
    try {
      results.push(await inTenantTransaction(tenant.id, input.dryRun, async (tx) => {
        const base = { tenantId: tenant.id, tenantName: tenant.name, modules: [] as string[], pausedItems: 0 };
        if (emergency) {
          const already = await tx.query(`select 1 from "ModuleEmergencyTenant" where "emergencyId" = $1 and "tenantId" = $2 and "moduleKey" = $3 and "restoredAt" is null`, [emergencyId, tenant.id, input.moduleKey]);
          if (already.rowCount) return { ...base, outcome: "ALREADY_IN_EMERGENCY" as const };
        }
        const { states, names } = await getEffectiveModuleStates(tenant.id, tx);
        if (!states[input.moduleKey]) return { ...base, outcome: "ALREADY_OFF" as const };
        const dependents = dependentsToCascade(input.moduleKey, states);
        if (dependents.length && !input.includeDependents) {
          return { ...base, outcome: "BLOCKED_BY_DEPENDENTS" as const, detail: `${dependents.map((key) => names[key] ?? key).join(", ")} ${dependents.length > 1 ? "depend" : "depends"} on it (use include-dependents)` };
        }
        let pausedItems = 0;
        for (const moduleKey of [input.moduleKey, ...dependents]) {
          const current = (await tx.query<{ status: string; trialEndsAt: string | null }>(
            `select status, "trialEndsAt" from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = $2 for update`,
            [tenant.id, moduleKey],
          )).rows[0];
          const previousStatus = current?.status === "TRIAL" ? "TRIAL" : "ENABLED";
          if (emergency) {
            await tx.query(
              `insert into "ModuleEmergencyTenant" ("emergencyId", "tenantId", "moduleKey", "previousStatus", "previousTrialEndsAt") values ($1, $2, $3, $4, $5)
               on conflict ("emergencyId", "tenantId", "moduleKey") do update set "previousStatus" = excluded."previousStatus", "previousTrialEndsAt" = excluded."previousTrialEndsAt", "suspendedAt" = now(), "restoredAt" = null, "liftOutcome" = null`,
              [emergencyId, tenant.id, moduleKey, previousStatus, previousStatus === "TRIAL" ? current?.trialEndsAt ?? null : null],
            );
          }
          const why = moduleKey === input.moduleKey ? `Emergency suspension: ${reason}` : `Emergency suspension of ${names[input.moduleKey] ?? input.moduleKey} (depends on it): ${reason}`;
          await writeEntitlement(tx, tenant.id, moduleKey, "SUSPENDED", why, actor.id, "EMERGENCY_SUSPENDED", null);
          pausedItems += (await applyLifecycle(tx, tenant.id, moduleKey, states[moduleKey], false)).paused;
        }
        return { ...base, outcome: "SUSPENDED" as const, modules: [input.moduleKey, ...dependents], pausedItems };
      }));
    } catch (error) {
      results.push({ tenantId: tenant.id, tenantName: tenant.name, outcome: "FAILED", modules: [], pausedItems: 0, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!input.dryRun && emergency) {
    // A freshly created emergency that suspended nothing (module already off everywhere) is not kept.
    if (!reused && !results.some((row) => row.outcome === "SUSPENDED")) {
      await queryAsSystem(`delete from "ModuleEmergency" e where e.id = $1 and not exists (select 1 from "ModuleEmergencyTenant" t where t."emergencyId" = e.id)`, [emergencyId]);
    }
    const notice = emergency.tenantNotice
      ?? `${moduleRow.name} has been temporarily suspended by your platform administrator. Your data is kept and scheduled work is paused; it will be restored when the suspension is lifted.`;
    for (const row of results.filter((result) => result.outcome === "SUSPENDED")) {
      await notify(row.tenantId, await tenantAdminIds(row.tenantId), `${moduleRow.name} temporarily suspended`, notice, { event: "MODULE_EMERGENCY_SUSPENDED", moduleKey: input.moduleKey, modules: row.modules });
    }
    const suspended = results.filter((row) => row.outcome === "SUSPENDED").length;
    if (suspended) {
      await notify(null, await platformAdminIds(), `Emergency: ${moduleRow.name} suspended for ${suspended} tenant${suspended === 1 ? "" : "s"}`, `${actor.email}: ${reason}`, { event: "MODULE_EMERGENCY_SUSPENDED", moduleKey: input.moduleKey, emergencyId });
    }
  }
  return { emergency: emergency ? { ...emergency, reused } : null, module: moduleRow, dryRun: input.dryRun, results };
}

export async function liftModuleEmergency(actor: EmergencyActor, input: { moduleKey: string; tenantIds: string[] | "ALL"; reason: string; dryRun: boolean }) {
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("REASON_REQUIRED");
  const moduleRow = await assertSwitchableModule(input.moduleKey);
  const emergency = await queryOneAsSystem<EmergencyRow>(openEmergencySql, [input.moduleKey]);
  if (!emergency) throw new Error("NO_OPEN_EMERGENCY");
  const pending = await queryAsSystem<{ tenantId: string; tenantName: string }>(
    `select distinct t."tenantId", tn.name as "tenantName" from "ModuleEmergencyTenant" t join "Tenant" tn on tn.id = t."tenantId"
     where t."emergencyId" = $1 and t."restoredAt" is null ${input.tenantIds === "ALL" ? "" : `and t."tenantId" = any($2)`}
     order by tn.name, t."tenantId"`,
    input.tenantIds === "ALL" ? [emergency.id] : [emergency.id, input.tenantIds],
  );

  const results: TenantLiftResult[] = [];
  for (const tenant of pending) {
    try {
      results.push(await inTenantTransaction(tenant.tenantId, input.dryRun, async (tx) => {
        let remaining = (await tx.query<{ moduleKey: string; previousStatus: "ENABLED" | "TRIAL"; previousTrialEndsAt: string | null }>(
          `select "moduleKey", "previousStatus", "previousTrialEndsAt" from "ModuleEmergencyTenant" where "emergencyId" = $1 and "tenantId" = $2 and "restoredAt" is null for update`,
          [emergency.id, tenant.tenantId],
        )).rows;
        const modules: TenantLiftResult["modules"] = [];
        let restoredItems = 0;
        const resolve = async (moduleKey: string, outcome: LiftOutcome, detail?: string) => {
          modules.push({ moduleKey, outcome, ...(detail ? { detail } : {}) });
          await tx.query(`update "ModuleEmergencyTenant" set "restoredAt" = now(), "liftOutcome" = $4 where "emergencyId" = $1 and "tenantId" = $2 and "moduleKey" = $3`, [emergency.id, tenant.tenantId, moduleKey, outcome]);
        };
        // Requirements before dependents: restore whatever has its requirements on, repeat.
        while (remaining.length) {
          const { states, names, flagOn } = await getEffectiveModuleStates(tenant.tenantId, tx);
          const ready = remaining.find((row) => requiredModules(row.moduleKey).every((required) => states[required] || !remaining.some((other) => other.moduleKey === required)));
          const row = ready ?? remaining[0];
          remaining = remaining.filter((candidate) => candidate !== row);
          const current = (await tx.query<{ status: string; lastAction: string | null }>(
            `select e.status, (select a.action from "TenantModuleAuditLog" a where a."tenantId" = e."tenantId" and a."moduleKey" = e."moduleKey" order by a."performedAt" desc limit 1) as "lastAction"
             from "TenantModuleEntitlement" e where e."tenantId" = $1 and e."moduleKey" = $2 for update`,
            [tenant.tenantId, row.moduleKey],
          )).rows[0];
          if (current?.status !== "SUSPENDED" || current.lastAction !== "EMERGENCY_SUSPENDED") {
            await resolve(row.moduleKey, "CHANGED_SINCE", `now ${current?.status ?? "ENABLED"}; left as it is`);
            continue;
          }
          if (row.previousStatus === "TRIAL" && (!row.previousTrialEndsAt || new Date(row.previousTrialEndsAt).getTime() <= Date.now())) {
            await resolve(row.moduleKey, "TRIAL_ENDED", "its trial ended during the suspension; left suspended");
            continue;
          }
          const blocked = moduleChangeBlockedReason(states, row.moduleKey, true, (key) => names[key] ?? key);
          if (blocked) {
            await resolve(row.moduleKey, "REQUIREMENT_OFF", blocked);
            continue;
          }
          await writeEntitlement(tx, tenant.tenantId, row.moduleKey, row.previousStatus, `Emergency lifted: ${reason}`, actor.id, "EMERGENCY_LIFTED", row.previousStatus === "TRIAL" ? row.previousTrialEndsAt : null);
          restoredItems += (await applyLifecycle(tx, tenant.tenantId, row.moduleKey, states[row.moduleKey], flagOn(row.moduleKey))).restored;
          await resolve(row.moduleKey, "RESTORED");
        }
        return { tenantId: tenant.tenantId, tenantName: tenant.tenantName, modules, restoredItems };
      }));
    } catch (error) {
      results.push({ tenantId: tenant.tenantId, tenantName: tenant.tenantName, modules: [], restoredItems: 0, failed: error instanceof Error ? error.message : String(error) });
    }
  }

  let closed = false;
  if (!input.dryRun) {
    const closedRow = await queryOneAsSystem<{ id: string }>(
      `update "ModuleEmergency" e set "liftedAt" = now(), "liftedBy" = $2, "liftReason" = $3
       where e.id = $1 and e."liftedAt" is null and not exists (select 1 from "ModuleEmergencyTenant" t where t."emergencyId" = e.id and t."restoredAt" is null)
       returning id`,
      [emergency.id, actor.id, reason],
    );
    closed = !!closedRow;
    for (const row of results.filter((result) => result.modules.some((item) => item.outcome === "RESTORED"))) {
      await notify(row.tenantId, await tenantAdminIds(row.tenantId), `${moduleRow.name} is available again`, `The temporary suspension of ${moduleRow.name} has been lifted. Scheduled work that was paused has resumed.`, { event: "MODULE_EMERGENCY_LIFTED", moduleKey: input.moduleKey });
    }
  }
  return { emergency, module: moduleRow, dryRun: input.dryRun, closed, results };
}

/** Open emergencies (or recent ones), with how many tenant modules each still holds suspended. */
export async function listModuleEmergencies(includeLifted = false) {
  return queryAsSystem<EmergencyRow & { liftedAt: string | null; startedByEmail: string | null; suspendedCount: number; resolvedCount: number }>(
    `select e.id, e."moduleKey", e.reason, e."tenantNotice", e."startedBy", e."startedAt", e."liftedAt", u.email as "startedByEmail",
            count(t.*) filter (where t."restoredAt" is null)::int as "suspendedCount",
            count(t.*) filter (where t."restoredAt" is not null)::int as "resolvedCount"
     from "ModuleEmergency" e left join "User" u on u.id = e."startedBy" left join "ModuleEmergencyTenant" t on t."emergencyId" = e.id
     ${includeLifted ? "" : `where e."liftedAt" is null`}
     group by e.id, u.email order by e."startedAt" desc limit 50`,
    [],
  );
}
