/**
 * Local-only real-database check for tenant module switches (Module 21): dependency rules under
 * real transactions and concurrency, overlapping feature flags, the pre-disable impact scan, and
 * the Telephony / Data Platform gates on webhook paths. All fixtures belong to one temporary
 * tenant that is removed afterwards. Run: tsx scripts/module-switches-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  getEffectiveModuleStates,
  setTenantModuleStatus,
  ModuleDependencyError,
} from "../src/lib/server/module-entitlements";
import { getModuleDisableImpact } from "../src/lib/server/module-impact";
import { enqueueWebhookEvent, processWebhookOutbox } from "../src/lib/server/webhook-outbox";
import { recordTelephonyCallEvent } from "../src/lib/server/telephony-webhook";
import { captureInboundLead } from "../src/lib/server/inbound-webhooks";
import { listCasesForTenant } from "../src/lib/repositories/cases-postgres";
import { enqueueAppEvent } from "../src/lib/server/marketplace-events";
import { listPayoutCyclesForTenant, canCurrentUserAccessPayoutModule } from "../src/lib/server/payouts";
import { listOpportunityTypesForTenant, listAvailableFormsForPlacement } from "../src/lib/server/crm";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  const tenant = randomUUID();
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejectsWith = async (promise: Promise<unknown>, pattern: RegExp, label: string) => { await assert.rejects(promise, pattern, label); checks++; };

  // Any existing user satisfies the audit/updatedBy foreign keys; it is only referenced, never changed.
  const admin = (await q(`select id from "User" order by "createdAt" limit 1`)).rows[0];
  assert.ok(admin, "At least one local user is required as the audit actor");
  const actor = { id: admin.id as string, tenantId: null, isPlatformAdmin: true };

  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Module switch smoke', now())`, [tenant]);

    // 1. Dependency rules with real transactions.
    await rejectsWith(setTenantModuleStatus(actor, tenant, "PARTNERS", "DISABLED"), /Payouts depends on Partners/, "cannot disable Partners while Payouts is on");
    await setTenantModuleStatus(actor, tenant, "PAYOUTS", "DISABLED", "smoke");
    await setTenantModuleStatus(actor, tenant, "PARTNERS", "DISABLED", "smoke");
    await rejectsWith(setTenantModuleStatus(actor, tenant, "PAYOUTS", "ENABLED"), /Payouts requires Partners/, "cannot enable Payouts while Partners is off");
    const audit = (await q(`select count(*)::int as n from "TenantModuleAuditLog" where "tenantId" = $1`, [tenant])).rows[0].n;
    check(audit === 2, "refused changes write no audit rows");

    // 2. Concurrency: repeatedly race "enable Payouts" against "disable Partners". Without the
    // tenant lock both could pass their checks; with it, the end state is always valid.
    for (let round = 0; round < 8; round++) {
      await setTenantModuleStatus(actor, tenant, "PARTNERS", "ENABLED");
      await setTenantModuleStatus(actor, tenant, "PAYOUTS", "DISABLED");
      await Promise.allSettled([
        setTenantModuleStatus(actor, tenant, "PAYOUTS", "ENABLED"),
        setTenantModuleStatus(actor, tenant, "PARTNERS", "DISABLED"),
      ]);
      const { states } = await getEffectiveModuleStates(tenant);
      assert.ok(!(states.PAYOUTS && !states.PARTNERS), `round ${round}: Payouts on with Partners off`);
    }
    checks++;

    // 3. Automations can't be switched off while Journey Orchestration needs it (the feature-flags
    // API makes this same module change for the old Automations flag, decision 15).
    await setTenantModuleStatus(actor, tenant, "PAYOUTS", "DISABLED");
    await rejectsWith(
      setTenantModuleStatus(actor, tenant, "AUTOMATIONS", "DISABLED"),
      /Journey Orchestration depends on Automations/,
      "cannot switch Automations off while Journeys is on",
    );
    check((await getEffectiveModuleStates(tenant)).states.AUTOMATIONS === true, "refused change is not applied");
    check(new ModuleDependencyError("x") instanceof Error, "dependency error type");

    // 4. Impact scan runs against the real schema (every query valid, nothing fabricated).
    for (const moduleKey of ["DATA_PLATFORM", "TELEPHONY", "AUTOMATIONS", "MARKETING", "PAYOUTS", "SERVICE_DESK", "PRODUCT_CATALOG"]) {
      const items = await getModuleDisableImpact(tenant, moduleKey);
      assert.ok(items.length > 0 && items.every((item) => item.count === 0), `${moduleKey} impact`);
    }
    checks++;

    // 5. Telephony off: provider events are refused and nothing is recorded.
    await setTenantModuleStatus(actor, tenant, "TELEPHONY", "DISABLED", "smoke");
    await rejectsWith(recordTelephonyCallEvent(tenant, { callId: "smoke-call", direction: "INBOUND", fromNumber: "+919876543210", status: "ringing" }), /MODULE_DISABLED:TELEPHONY/, "telephony event refused");
    check((await q(`select count(*)::int as n from "TelephonyCallLog" where "tenantId" = $1`, [tenant])).rows[0].n === 0, "no call log written");

    // 6. Data Platform: inbound leads refused; outbound deliveries not queued, and a backlog
    // queued while enabled is cancelled (not sent) once disabled.
    await q(`insert into "WebhookSubscription" (id, "tenantId", url, events, "isActive", "updatedAt") values ($1, $2, 'https://hooks.example.com/smoke', '["lead.created"]', true, now())`, [randomUUID(), tenant]);
    await enqueueWebhookEvent(tenant, "lead.created" as never, { id: "smoke" });
    check((await q(`select count(*)::int as n from "WebhookOutbox" where "tenantId" = $1`, [tenant])).rows[0].n === 1, "enabled tenant queues a delivery");
    await setTenantModuleStatus(actor, tenant, "DATA_PLATFORM", "DISABLED", "smoke");
    await enqueueWebhookEvent(tenant, "lead.created" as never, { id: "smoke-2" });
    check((await q(`select count(*)::int as n from "WebhookOutbox" where "tenantId" = $1`, [tenant])).rows[0].n === 1, "disabled tenant queues nothing new");
    const impact = await getModuleDisableImpact(tenant, "DATA_PLATFORM");
    check(impact.find((item) => item.label.startsWith("Webhook deliveries"))?.count === 1, "impact scan counts the pending delivery");
    await q(`update "WebhookOutbox" set "createdAt" = now() - interval '10 years' where "tenantId" = $1`, [tenant]); // first in the worker's queue
    await processWebhookOutbox(5);
    check((await q(`select status from "WebhookOutbox" where "tenantId" = $1`, [tenant])).rows[0].status === "CANCELLED", "backlog cancelled, not delivered");
    await rejectsWith(captureInboundLead(tenant, { name: "Smoke lead", email: "smoke@example.invalid" }), /MODULE_DISABLED:DATA_PLATFORM/, "inbound lead refused");
    check((await q(`select count(*)::int as n from "Lead" where "tenantId" = $1`, [tenant])).rows[0].n === 0, "no lead created");

    // 7. Read paths of the older modules (2026-09-29 audit: reads used to skip the module gate).
    const member = { id: admin.id as string, tenantId: tenant, isPlatformAdmin: false } as never;
    await setTenantModuleStatus(actor, tenant, "SERVICE_DESK", "SUSPENDED", "smoke");
    await rejectsWith(listCasesForTenant(member), /MODULE_DISABLED:SERVICE_DESK/, "case list refused while Service Desk is suspended");
    await setTenantModuleStatus(actor, tenant, "MARKETPLACE", "DISABLED", "smoke");
    await enqueueAppEvent(tenant, "lead.created" as never, { id: "smoke" });
    check((await q(`select count(*)::int as n from "TenantAppDelivery" where "tenantId" = $1`, [tenant])).rows[0].n === 0, "no app event queued while Marketplace is off");
    await setTenantModuleStatus(actor, tenant, "PAYOUTS", "DISABLED", "smoke");
    await rejectsWith(listPayoutCyclesForTenant(member), /FEATURE_DISABLED:payoutsEnabled/, "payout cycles refused while Payouts is off");
    check((await canCurrentUserAccessPayoutModule(member)) === false, "partner payout access is 'no', not an error");
    await setTenantModuleStatus(actor, tenant, "OPPORTUNITIES", "DISABLED", "smoke");
    check(Array.isArray(await listOpportunityTypesForTenant(member)) && (await listOpportunityTypesForTenant(member)).length === 0, "opportunity types empty (not an error) while Opportunities is off");
    await setTenantModuleStatus(actor, tenant, "FORMS", "DISABLED", "smoke");
    check((await listAvailableFormsForPlacement(member, "LEAD_DETAIL")).length === 0, "lead-page forms panel empty while Forms is off");

    console.log(JSON.stringify({ status: "passed", checks, concurrencyRounds: 8 }));
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenant]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenant]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
