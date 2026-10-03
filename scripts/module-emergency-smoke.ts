/**
 * Local-only real-database check for emergency module suspension (scripts/module-emergency.ts):
 * dry run changes nothing; suspend records previous status, pauses live work, audits, notifies;
 * dependents block unless included and are lifted after their requirement; re-runs are
 * idempotent; lift restores exactly the previous status (incl. trial end) and skips modules
 * changed since, trials that ended meanwhile; the emergency closes when nothing is left; the CLI
 * refuses non-admin actors and an unconfirmed all-tenants suspension. Temporary tenants only --
 * never --all-tenants for real (only as a refused/dry-run CLI call). Removed afterwards.
 * Run: tsx scripts/module-emergency-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import { spawnSync } from "child_process";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { setTenantModuleStatus } from "../src/lib/server/module-entitlements";
import { liftModuleEmergency, listModuleEmergencies, resolvePlatformAdminActor, suspendModuleEmergency } from "../src/lib/server/module-emergency";
import { refreshTenantModuleHealth } from "../src/lib/server/module-health";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenants: string[] = [];
  const emergencyIds: string[] = [];
  const newTenant = async (name: string) => {
    const id = randomUUID();
    tenants.push(id);
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
    return id;
  };
  const status = async (tenantId: string, moduleKey: string) => (await one(`select status, "trialEndsAt" from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = $2`, [tenantId, moduleKey])) ?? { status: "ENABLED", trialEndsAt: null };
  const cli = (...args: string[]) => spawnSync("npx", ["tsx", "scripts/module-emergency.ts", ...args], { encoding: "utf8" });
  const opsEmail = `ops-${randomUUID()}@example.invalid`;

  try {
    // Operator: an active platform admin (in a throwaway tenant so the user has a role).
    const ops = await newTenant("Emergency smoke ops");
    const opsRole = randomUUID();
    const opsUser = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Ops', '{}', now())`, [opsRole, ops]);
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Ops', 'x', $4, now())`, [opsUser, ops, opsEmail, opsRole]);
    await q(`insert into "PlatformAdmin" (id, "userId", permissions, "isActive", "updatedAt") values ($1, $2, '{}', true, now())`, [randomUUID(), opsUser]);
    const actor = await resolvePlatformAdminActor(opsEmail.toUpperCase());
    check(actor.id === opsUser, "operator resolved by email (case-insensitive)");

    const [t1, t2, t3] = [await newTenant("Emergency smoke 1"), await newTenant("Emergency smoke 2"), await newTenant("Emergency smoke 3")];
    const adminRole = randomUUID();
    const tenantAdmin = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"modules":{"admin":"full"}}', now())`, [adminRole, t1]);
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Admin', 'x', $4, now())`, [tenantAdmin, t1, `a-${randomUUID()}@example.invalid`, adminRole]);
    const trialEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    await setTenantModuleStatus(actor as never, t2, "MARKETPLACE", "TRIAL", "smoke", { trialEndsAt: trialEnd });
    await setTenantModuleStatus(actor as never, t3, "MARKETPLACE", "DISABLED", "smoke");

    // Dry run: outcomes reported, nothing written.
    const dry = await suspendModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: [t1, t2, t3], reason: "Smoke dry run", includeDependents: false, dryRun: true });
    check(dry.results.map((row) => row.outcome).join() === "SUSPENDED,SUSPENDED,ALREADY_OFF", `dry run reports the outcome (${dry.results.map((row) => row.outcome)})`);
    check((await status(t1, "MARKETPLACE")).status === "ENABLED" && !(await one(`select 1 from "ModuleEmergency" where "moduleKey" = 'MARKETPLACE' and "liftedAt" is null and "startedBy" = $1`, [opsUser])), "dry run changes nothing");

    // Suspend: previous status recorded, audited, tenant admins notified.
    const suspended = await suspendModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: [t1, t2, t3], reason: "Smoke: app webhook leak", tenantNotice: null, includeDependents: false, dryRun: false });
    emergencyIds.push(suspended.emergency!.id);
    check((await status(t1, "MARKETPLACE")).status === "SUSPENDED" && (await status(t2, "MARKETPLACE")).status === "SUSPENDED" && (await status(t3, "MARKETPLACE")).status === "DISABLED", "enabled and trial tenants suspended; disabled tenant untouched");
    const recorded = (await q(`select "tenantId", "previousStatus", "previousTrialEndsAt" from "ModuleEmergencyTenant" where "emergencyId" = $1 order by "tenantId"`, [suspended.emergency!.id])).rows;
    check(recorded.length === 2 && recorded.find((row) => row.tenantId === t2)?.previousStatus === "TRIAL" && new Date(recorded.find((row) => row.tenantId === t2)!.previousTrialEndsAt).toISOString() === trialEnd, "previous status and trial end recorded");
    check((await one(`select action, "performedBy" from "TenantModuleAuditLog" where "tenantId" = $1 and "moduleKey" = 'MARKETPLACE' order by "performedAt" desc limit 1`, [t1]))?.performedBy === opsUser, "audited under the operator");
    check((await one(`select count(*)::int as n from "Notification" where "userId" = $1 and data ->> 'event' = 'MODULE_EMERGENCY_SUSPENDED'`, [tenantAdmin])).n === 1, "tenant admin notified (default notice, internal reason not shown)");
    check(!(await one(`select message from "Notification" where "userId" = $1 and data ->> 'event' = 'MODULE_EMERGENCY_SUSPENDED'`, [tenantAdmin])).message.includes("webhook leak"), "the internal reason is not sent to tenants");
    const health = (await refreshTenantModuleHealth(t1)).find((row) => row.moduleKey === "MARKETPLACE")!;
    check(health.state === "SUSPENDED" && /Temporarily suspended by the platform team/.test(health.issues[0]?.message ?? ""), "health badge explains the emergency");

    // Re-run is idempotent and joins the open emergency.
    const again = await suspendModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: [t1], reason: "Smoke re-run", includeDependents: false, dryRun: false });
    check(again.emergency?.reused && again.emergency.id === suspended.emergency!.id && again.results[0].outcome === "ALREADY_IN_EMERGENCY", "re-run reuses the open emergency");
    check((await listModuleEmergencies()).some((row) => row.id === suspended.emergency!.id && row.suspendedCount === 2), "status lists the open emergency");

    // Lift: t1 changed since (re-enabled by hand) is left as is; t2 gets its trial back.
    await setTenantModuleStatus(actor as never, t1, "MARKETPLACE", "DISABLED", "smoke: decided to remove");
    const lifted = await liftModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: "ALL", reason: "Smoke: fix deployed", dryRun: false });
    const outcomeOf = (tenantId: string) => lifted.results.find((row) => row.tenantId === tenantId)?.modules[0]?.outcome;
    check(outcomeOf(t1) === "CHANGED_SINCE" && (await status(t1, "MARKETPLACE")).status === "DISABLED", "a module changed during the emergency is left as it is");
    const t2Now = await status(t2, "MARKETPLACE");
    check(outcomeOf(t2) === "RESTORED" && t2Now.status === "TRIAL" && new Date(t2Now.trialEndsAt).toISOString() === trialEnd, "trial restored with its original end date");
    check(lifted.closed && (await one(`select "liftedBy" from "ModuleEmergency" where id = $1`, [suspended.emergency!.id])).liftedBy === opsUser, "emergency closed when nothing is left suspended");

    // Dependents: blocked unless included; included ones are lifted after their requirement, and
    // paused live work comes back.
    const automation = randomUUID();
    await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, "isActive", "updatedAt") values ($1, $2, 'Smoke', '{}', true, now())`, [automation, t3]);
    const blocked = await suspendModuleEmergency(actor, { moduleKey: "AUTOMATIONS", tenantIds: [t3], reason: "Smoke: automation loop", includeDependents: false, dryRun: false });
    check(blocked.results[0].outcome === "BLOCKED_BY_DEPENDENTS" && /Journey/.test(blocked.results[0].detail ?? "") && (await status(t3, "AUTOMATIONS")).status === "ENABLED", "dependents block the suspension unless included");
    check(!(await one(`select 1 from "ModuleEmergency" where "moduleKey" = 'AUTOMATIONS' and "liftedAt" is null and "startedBy" = $1`, [opsUser])), "an emergency that suspended nothing is not kept");
    const withDeps = await suspendModuleEmergency(actor, { moduleKey: "AUTOMATIONS", tenantIds: [t3], reason: "Smoke: automation loop", includeDependents: true, dryRun: false });
    emergencyIds.push(withDeps.emergency!.id);
    check(withDeps.results[0].modules.join() === "AUTOMATIONS,JOURNEY_ORCHESTRATION" && (await status(t3, "JOURNEY_ORCHESTRATION")).status === "SUSPENDED", "included dependents are suspended with it");
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [automation])).isActive === false && withDeps.results[0].pausedItems === 1, "live work paused");
    const liftDeps = await liftModuleEmergency(actor, { moduleKey: "AUTOMATIONS", tenantIds: [t3], reason: "Smoke: loop fixed", dryRun: false });
    check(liftDeps.results[0].modules.map((row) => `${row.moduleKey}:${row.outcome}`).join() === "AUTOMATIONS:RESTORED,JOURNEY_ORCHESTRATION:RESTORED", `requirement lifted before its dependent (${liftDeps.results[0].modules.map((row) => `${row.moduleKey}:${row.outcome}`)})`);
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [automation])).isActive === true, "paused live work restored");

    // A trial that ended during the emergency stays suspended.
    await setTenantModuleStatus(actor as never, t2, "MARKETPLACE", "TRIAL", "smoke", { trialEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    const trialEm = await suspendModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: [t2], reason: "Smoke: second incident", includeDependents: false, dryRun: false });
    emergencyIds.push(trialEm.emergency!.id);
    await q(`update "ModuleEmergencyTenant" set "previousTrialEndsAt" = now() - interval '1 minute' where "emergencyId" = $1`, [trialEm.emergency!.id]);
    const trialLift = await liftModuleEmergency(actor, { moduleKey: "MARKETPLACE", tenantIds: "ALL", reason: "Smoke: done", dryRun: false });
    check(trialLift.results[0].modules[0].outcome === "TRIAL_ENDED" && (await status(t2, "MARKETPLACE")).status === "SUSPENDED", "a trial that ended meanwhile stays suspended");

    // CLI guards (no change can happen: refused before any write).
    const notAdmin = cli("suspend", "--module", "MARKETPLACE", "--tenant", t1, "--actor", "nobody@example.invalid", "--reason", "Smoke CLI");
    check(notAdmin.status === 1 && /active platform admin/.test(notAdmin.stderr), "CLI refuses a non-admin actor");
    const unconfirmed = cli("suspend", "--module", "MARKETPLACE", "--all-tenants", "--actor", opsEmail, "--reason", "Smoke CLI");
    check(unconfirmed.status === 1 && /--confirm MARKETPLACE/.test(unconfirmed.stderr), "CLI refuses an all-tenants suspension without --confirm");
    const cliDry = cli("suspend", "--module", "marketplace", "--tenant", t3, "--actor", opsEmail, "--reason", "Smoke CLI dry run", "--dry-run", "--include-dependents");
    check(cliDry.status === 0 && /DRY RUN \(nothing changed\)/.test(cliDry.stdout) && /ALREADY_OFF/.test(cliDry.stdout), `CLI dry run prints per-tenant outcomes (${cliDry.stdout.trim().split("\n").at(-1)})`);
    const noEmergency = cli("lift", "--module", "GAMIFICATION", "--actor", opsEmail, "--reason", "Smoke CLI lift");
    check(noEmergency.status === 1 && /no open emergency/.test(noEmergency.stderr), "CLI lift without an open emergency is refused");
    const cliStatus = cli("status", "--all");
    check(cliStatus.status === 0 && /MARKETPLACE/.test(cliStatus.stdout), "CLI status lists emergencies");

    console.log(JSON.stringify({ status: "passed", checks }));
  } finally {
    await q(`delete from "Notification" where data ->> 'emergencyId' = any($1)`, [emergencyIds]).catch(() => undefined);
    await q(`delete from "ModuleEmergency" where id = any($1)`, [emergencyIds]).catch(() => undefined);
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    await q(`delete from "PlatformAdmin" where "userId" in (select id from "User" where email = $1)`, [opsEmail]).catch(() => undefined);
    for (const id of tenants) {
      await q(`delete from "Notification" where "tenantId" = $1`, [id]).catch(() => undefined);
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
    // Deleting its tenant nulls the operator's tenantId, so remove it by email.
    await q(`delete from "User" where email = $1`, [opsEmail]).catch(() => undefined);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
