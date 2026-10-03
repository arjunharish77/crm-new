/**
 * Local-only real-database check for migration 0126 (decision 15: feature flags merged into
 * modules). Fixture workspaces, then the migration's SQL is run again (it is safe to repeat):
 *   - a flag that is off becomes a DISABLED module, whether the module had no row, was
 *     ENABLED or on TRIAL; each change is in the module audit log;
 *   - a module already DISABLED or SUSPENDED is left as it is; a flag that is on changes nothing;
 *   - afterwards the feature check follows the module alone, and what each workspace could use
 *     is the same as before;
 *   - running it again changes nothing.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/flags-into-modules-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { isFeatureEnabledForTenant } from "../src/lib/server/entitlements";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const migration = readFileSync(new URL("../migrations/0126_feature_flags_into_modules.sql", import.meta.url), "utf8");

  const tenants = { noRow: randomUUID(), enabled: randomUUID(), trial: randomUUID(), alreadyOff: randomUUID(), flagOn: randomUUID() };
  try {
    for (const [label, id] of Object.entries(tenants)) {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, `Flags smoke ${label}`]);
      await q(`insert into "TenantFeature" (id, "tenantId", "payoutsEnabled", "gamificationEnabled", "updatedAt") values ($1, $2, $3, true, now())`, [randomUUID(), id, label === "flagOn"]);
    }
    const entitlement = async (tenantId: string, status: string) =>
      q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'PAYOUTS', $3)`, [randomUUID(), tenantId, status]);
    await entitlement(tenants.enabled, "ENABLED");
    await entitlement(tenants.trial, "TRIAL");
    await entitlement(tenants.alreadyOff, "SUSPENDED");

    const status = async (tenantId: string) => (await q(`select status from "TenantModuleEntitlement" where "tenantId" = $1 and "moduleKey" = 'PAYOUTS'`, [tenantId])).rows[0]?.status ?? null;
    const audits = async (tenantId: string) => Number((await q(`select count(*)::int n from "TenantModuleAuditLog" where "tenantId" = $1 and "moduleKey" = 'PAYOUTS'`, [tenantId])).rows[0].n);

    await q(migration);

    check((await status(tenants.noRow)) === "DISABLED" && (await audits(tenants.noRow)) === 1, "flag off, no module row: the module becomes DISABLED, audited");
    check((await status(tenants.enabled)) === "DISABLED", "flag off, module ENABLED: the module becomes DISABLED");
    check((await status(tenants.trial)) === "DISABLED", "flag off, module on TRIAL: the module becomes DISABLED");
    check((await status(tenants.alreadyOff)) === "SUSPENDED" && (await audits(tenants.alreadyOff)) === 0, "a module already off is left as it is");
    check((await status(tenants.flagOn)) === null && (await audits(tenants.flagOn)) === 0, "a flag that is on changes nothing");
    check((await q(`select "payoutsEnabled" from "TenantFeature" where "tenantId" = $1`, [tenants.noRow])).rows[0].payoutsEnabled === false, "the flag column itself is kept");

    for (const [label, id] of Object.entries(tenants)) {
      check((await isFeatureEnabledForTenant(id, "payoutsEnabled")) === (label === "flagOn"), `${label}: payouts is ${label === "flagOn" ? "on" : "off"}, as before`);
    }
    check((await isFeatureEnabledForTenant(tenants.noRow, "gamificationEnabled")) === true, "a module with its flag on stays on");

    await q(`update "TenantModuleEntitlement" set status = 'ENABLED' where "tenantId" = $1 and "moduleKey" = 'PAYOUTS'`, [tenants.enabled]);
    check((await isFeatureEnabledForTenant(tenants.enabled, "payoutsEnabled")) === true, "after the merge, switching the module on is enough; the old flag no longer blocks it");

    const before = await Promise.all(Object.values(tenants).map(audits));
    await q(`update "TenantModuleEntitlement" set status = 'DISABLED' where "tenantId" = $1 and "moduleKey" = 'PAYOUTS'`, [tenants.enabled]);
    await q(migration);
    const after = await Promise.all(Object.values(tenants).map(audits));
    check(JSON.stringify(before) === JSON.stringify(after), "running it again changes nothing");

    console.log(`flags-into-modules-smoke: ${checks} checks passed`);
  } finally {
    for (const id of Object.values(tenants)) {
      for (const table of ["TenantModuleAuditLog", "TenantModuleEntitlement", "TenantFeature"]) await q(`delete from "${table}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]).catch(() => undefined);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
