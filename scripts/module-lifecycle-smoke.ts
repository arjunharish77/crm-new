/**
 * Local-only real-database check for Module 21 lifecycle work: pause/restore on switch-off/on
 * (including via a legacy feature flag and an item changed meanwhile), trial warnings and
 * cascading expiry, tenant access requests, and bundle validation. All fixtures belong to one
 * temporary tenant (plus one temporary bundle) removed afterwards.
 * Run: tsx scripts/module-lifecycle-smoke.ts
 */
import { isFeatureEnabledForTenant } from "../src/lib/server/entitlements";
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { processModuleTrials, setTenantModuleStatus, ModuleDependencyError } from "../src/lib/server/module-entitlements";
import { listModulesForTenantAdmin, requestModuleAccess, resolveModuleAccessRequest, saveModuleBundle } from "../src/lib/server/module-access";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const one = async (sql: string, args: unknown[] = []) => (await q(sql, args)).rows[0];
  const tenant = randomUUID();
  const roleId = randomUUID();
  const tenantAdminId = randomUUID();
  const bundleKey = `SMOKE_${Date.now().toString(36).toUpperCase()}`;
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejectsWith = async (promise: Promise<unknown>, pattern: RegExp | (new (...args: any[]) => Error), label: string) => { await assert.rejects(promise, pattern as any, label); checks++; };

  const actorRow = await one(`select u.id from "User" u join "PlatformAdmin" p on p."userId"::text = u.id and p."isActive" order by u."createdAt" limit 1`) ?? await one(`select id from "User" order by "createdAt" limit 1`);
  const actor = { id: actorRow.id as string, tenantId: null, isPlatformAdmin: true };
  const tenantAdmin = { id: tenantAdminId, tenantId: tenant, isPlatformAdmin: false };

  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Module lifecycle smoke', now())`, [tenant]);
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"modules":{"admin":"full"}}', now())`, [roleId, tenant]);
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke Admin', 'x', $4, now())`, [tenantAdminId, tenant, `smoke-${tenantAdminId}@example.invalid`, roleId]);

    // --- 1. Pause on switch-off, restore on switch-on; a tenant's own pause is left alone.
    const [autoLive, autoOwnPause] = [randomUUID(), randomUUID()];
    await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, "isActive", "updatedAt") values ($1, $3, 'Live', '{}', true, now()), ($2, $3, 'Paused by tenant', '{}', false, now())`, [autoLive, autoOwnPause, tenant]);
    const [campRunning, campScheduled] = [randomUUID(), randomUUID()];
    await q(`insert into "MarketingCampaign" (id, "tenantId", name, channel, status) values ($1, $3, 'Running', 'EMAIL', 'RUNNING'), ($2, $3, 'Scheduled', 'EMAIL', 'SCHEDULED')`, [campRunning, campScheduled, tenant]);
    const callCampaign = randomUUID();
    await q(`insert into "CallCampaign" (id, "tenantId", name, module, "audienceType", status) values ($1, $2, 'Calls', 'LEAD', 'MANUAL', 'ACTIVE')`, [callCampaign, tenant]);

    await setTenantModuleStatus(actor, tenant, "JOURNEY_ORCHESTRATION", "DISABLED"); // unblock Automations/Marketing
    const off = await setTenantModuleStatus(actor, tenant, "AUTOMATIONS", "DISABLED", "smoke");
    check(off.paused === 1, "switching Automations off pauses exactly the live automation");
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [autoLive])).isActive === false, "live automation paused");
    await setTenantModuleStatus(actor, tenant, "MARKETING", "SUSPENDED", "smoke");
    await setTenantModuleStatus(actor, tenant, "TELEPHONY", "DISABLED", "smoke");
    check((await one(`select status from "CallCampaign" where id = $1`, [callCampaign])).status === "PAUSED", "call campaign paused");
    const modules = await listModulesForTenantAdmin(tenantAdmin);
    check(modules.find((m) => m.key === "MARKETING")?.status === "SUSPENDED", "tenant admin sees the suspended module");

    // Someone deliberately cancels one paused campaign while Marketing is off.
    await q(`update "MarketingCampaign" set status = 'CANCELLED' where id = $1`, [campScheduled]);
    const on = await setTenantModuleStatus(actor, tenant, "MARKETING", "ENABLED", "smoke");
    check(on.restored === 1, "re-enabling restores only the item still in the paused state");
    check((await one(`select status from "MarketingCampaign" where id = $1`, [campRunning])).status === "RUNNING", "running campaign restored");
    check((await one(`select status from "MarketingCampaign" where id = $1`, [campScheduled])).status === "CANCELLED", "a deliberate change made meanwhile is not overwritten");
    await setTenantModuleStatus(actor, tenant, "AUTOMATIONS", "ENABLED");
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [autoLive])).isActive === true, "automation restored");
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [autoOwnPause])).isActive === false, "automation the tenant paused itself stays paused");
    check((await one(`select count(*)::int as n from "ModulePausedItem" where "tenantId" = $1 and "moduleKey" in ('AUTOMATIONS','MARKETING') and "restoredAt" is null`, [tenant])).n === 0, "ledger closed after restore");

    // Decision 15: the old Automations flag no longer switches anything; the module alone decides.
    await q(`insert into "TenantFeature" (id, "tenantId", "automationEnabled", "updatedAt") values ($1, $2, false, now())
             on conflict ("tenantId") do update set "automationEnabled" = false`, [randomUUID(), tenant]).catch(async () =>
      q(`update "TenantFeature" set "automationEnabled" = false where "tenantId" = $1`, [tenant]));
    check((await one(`select "isActive" from "AutomationV2" where id = $1`, [autoLive])).isActive === true, "the old Automations flag set off pauses nothing");
    check(await isFeatureEnabledForTenant(tenant, "automationEnabled"), "and Automations stays on while its module is on");

    // --- 2. Trials: warning once, then expiry suspends the module and its enabled dependents.
    const now = new Date();
    const inThreeDays = new Date(now.getTime() + 3 * 864e5).toISOString();
    await rejectsWith(setTenantModuleStatus(actor, tenant, "PARTNERS", "TRIAL"), /TRIAL_END_DATE_REQUIRED/, "trial needs an end date");
    await setTenantModuleStatus(actor, tenant, "PARTNERS", "TRIAL", "smoke trial", { trialEndsAt: inThreeDays });
    const notificationsFor = async (event: string) => (await one(`select count(*)::int as n from "Notification" where data ->> 'event' = $1 and (data ->> 'moduleKey') = 'PARTNERS' and ("tenantId" = $2 or "tenantId" is null) and "createdAt" > now() - interval '5 minutes' and "userId" = any($3::text[])`, [event, tenant, [tenantAdminId, actor.id]])).n;
    const first = await processModuleTrials(now);
    check(first.warned >= 1 && (await notificationsFor("MODULE_TRIAL_ENDING")) >= 1, "7-day warning sent (tenant admin and platform admin)");
    const warningsAfterFirstRun = await notificationsFor("MODULE_TRIAL_ENDING");
    await processModuleTrials(now);
    check((await notificationsFor("MODULE_TRIAL_ENDING")) === warningsAfterFirstRun, "warning not repeated on the next run");
    check((await one(`select "trialWarningSentAt" from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = 'PARTNERS'`, [tenant])).trialWarningSentAt, "warning recorded");
    const later = new Date(now.getTime() + 4 * 864e5);
    const expiry = await processModuleTrials(later);
    check(expiry.expired >= 1, "trial expired at its end date");
    const statuses = Object.fromEntries((await q(`select "moduleKey", status from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" in ('PARTNERS','PAYOUTS')`, [tenant])).rows.map((r) => [r.moduleKey, r.status]));
    check(statuses.PARTNERS === "SUSPENDED" && statuses.PAYOUTS === "SUSPENDED", "Partners suspended with its dependent Payouts");
    const audit = (await q(`select "moduleKey", action, reason from "TenantModuleAuditLog" where "tenantId" = $1 and action in ('TRIAL_EXPIRED','DEPENDENCY_SUSPENDED')`, [tenant])).rows;
    check(audit.some((r) => r.moduleKey === "PARTNERS" && r.action === "TRIAL_EXPIRED") && audit.some((r) => r.moduleKey === "PAYOUTS" && r.action === "DEPENDENCY_SUSPENDED" && /Partners' trial expired/.test(r.reason)), "both audited with the reason");
    check((await notificationsFor("MODULE_TRIAL_EXPIRED")) >= 1, "expiry notification sent");

    // --- 3. Access requests.
    const request = await requestModuleAccess(tenantAdmin, "PAYOUTS", "We pay partner commissions monthly");
    await rejectsWith(requestModuleAccess(tenantAdmin, "PAYOUTS"), /MODULE_REQUEST_ALREADY_PENDING/, "one pending request per module");
    await rejectsWith(requestModuleAccess(tenantAdmin, "LEADS"), /MODULE_ALREADY_AVAILABLE/, "core modules cannot be requested");
    await rejectsWith(resolveModuleAccessRequest(actor, request.id, { decision: "APPROVED" }), ModuleDependencyError, "approval still obeys dependencies (Partners is suspended)");
    check((await one(`select status from "ModuleAccessRequest" where id = $1`, [request.id])).status === "PENDING", "a refused approval leaves the request pending");
    await setTenantModuleStatus(actor, tenant, "PARTNERS", "ENABLED");
    await resolveModuleAccessRequest(actor, request.id, { decision: "APPROVED", status: "TRIAL", trialEndsAt: new Date(now.getTime() + 30 * 864e5).toISOString(), note: "30-day trial" });
    check((await one(`select status from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = 'PAYOUTS'`, [tenant])).status === "TRIAL", "approval applied as a trial");
    await rejectsWith(resolveModuleAccessRequest(actor, request.id, { decision: "DECLINED" }), /MODULE_REQUEST_ALREADY_RESOLVED/, "a request resolves once");
    check((await one(`select count(*)::int as n from "Notification" where "userId" = $1 and data ->> 'event' = 'MODULE_ACCESS_RESOLVED'`, [tenantAdminId])).n === 1, "requester notified of the decision");

    // --- 4. Bundles.
    await rejectsWith(saveModuleBundle(actor, bundleKey, { name: "Broken", modules: ["DASHBOARD", "LEADS", "LISTS", "ACTIVITIES", "TASKS", "VIEWS", "SECURITY_ADMIN", "PAYOUTS"] }), /Payouts won't work: Partners is disabled/, "bundle cannot break a dependency");
    await rejectsWith(saveModuleBundle(actor, bundleKey, { name: "No core", modules: ["PARTNERS"] }), /Core modules must be included/, "bundle must include core modules");
    const saved = await saveModuleBundle(actor, bundleKey, { name: "Partner network", modules: ["DASHBOARD", "LEADS", "LISTS", "ACTIVITIES", "TASKS", "VIEWS", "SECURITY_ADMIN", "PARTNERS", "PAYOUTS"] });
    check(saved?.modules.length === 9, "valid bundle saved");

    console.log(JSON.stringify({ status: "passed", checks }));
  } finally {
    await q(`delete from "ModuleBundle" where key = $1`, [bundleKey]);
    await q(`delete from "Notification" where "userId" = $1 or (data ->> 'tenantId') = $2 or ("tenantId" = $2)`, [tenantAdminId, tenant]).catch(() => undefined);
    await q(`delete from "Notification" where "tenantId" is null and data ->> 'moduleKey' = 'PARTNERS' and "createdAt" > now() - interval '10 minutes' and data ->> 'event' like 'MODULE_%'`).catch(() => undefined);
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenant]).catch(() => undefined);
    await q(`delete from "User" where id = $1`, [tenantAdminId]).catch(() => undefined);
    await q(`delete from "Role" where id = $1`, [roleId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenant]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
