/**
 * Local-only real-database check that suspending or reactivating a workspace is recorded
 * (Section 8 #12: no reason was asked for and nothing reached the audit log):
 *   - a suspension without a reason is refused and leaves the workspace active;
 *   - with a reason, the workspace is suspended and its audit log has TENANT_SUSPENDED with who
 *     and why; reactivating adds TENANT_REACTIVATED (the note is optional);
 *   - an unknown workspace is TENANT_NOT_FOUND rather than a silent success.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/tenant-suspend-audit-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { setTenantStatusForPlatformAdmin } from "../src/lib/server/admin";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, `${label} (expected ${code})`);
    checks++;
  };
  const tenantId = randomUUID();
  const status = async () => (await q(`select status from "Tenant" where id = $1`, [tenantId])).rows[0].status;
  const audit = async (action: string) => (await q(`select "userId", diff from "AuditLog" where "tenantId" = $1 and action = $2 and "entityId" = $1`, [tenantId, action])).rows;
  try {
    await q(`insert into "Tenant" (id, name, status, "updatedAt") values ($1, 'Suspend audit smoke', 'ACTIVE', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke', '{}', now())`, [roleId, tenantId]);
    const actorId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke actor', 'x', $4, now())`, [actorId, tenantId, `actor.${actorId.slice(0, 8)}@smoke.invalid`, roleId]);
    const actor = { id: actorId };

    await rejects(() => setTenantStatusForPlatformAdmin(actor, tenantId, "SUSPENDED", { reason: "   " }), "SUSPEND_REASON_REQUIRED", "a suspension without a reason is refused");
    check((await status()) === "ACTIVE", "and the workspace stays active");

    await setTenantStatusForPlatformAdmin(actor, tenantId, "SUSPENDED", { reason: "Unpaid invoices" });
    check((await status()) === "SUSPENDED", "with a reason, the workspace is suspended");
    const suspended = await audit("TENANT_SUSPENDED");
    check(suspended.length === 1 && suspended[0].userId === actorId && suspended[0].diff?.reason === "Unpaid invoices", "and its audit log says who suspended it and why");

    await setTenantStatusForPlatformAdmin(actor, tenantId, "ACTIVE", {});
    check((await status()) === "ACTIVE", "reactivating needs no note");
    const reactivated = await audit("TENANT_REACTIVATED");
    check(reactivated.length === 1 && reactivated[0].userId === actorId && reactivated[0].diff?.reason === null, "and is in the audit log too");

    await rejects(() => setTenantStatusForPlatformAdmin(actor, randomUUID(), "ACTIVE", {}), "TENANT_NOT_FOUND", "an unknown workspace is reported, not a silent success");

    console.log(`tenant-suspend-audit-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
