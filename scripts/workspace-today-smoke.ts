/**
 * Local-only real-database check that "today" follows the workspace's time zone, not the
 * server's: a workspace set to Pacific/Auckland gets tasks due every hour from 30 hours ago to 30
 * hours ahead, and "Due today" (the Tasks list and the tasks export) returns exactly the ones whose
 * due time falls on today's date in Auckland, worked out independently with Intl.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/workspace-today-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listTasksPageForTenant } from "../src/lib/repositories/tasks-postgres";
import { getTenantTodayRange } from "../src/lib/server/date-format";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  const zone = "Pacific/Auckland";
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Workspace today smoke', now())`, [tenantId]);
    await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { generalSettings: { timezone: zone } }]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Manager', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, tenantId, `today.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;

    const localDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    const now = new Date();
    const expected = new Set<string>();
    for (let hours = -30; hours <= 30; hours++) {
      const id = randomUUID();
      const due = new Date(now.getTime() + hours * 3_600_000);
      await q(`insert into "Task" (id, "tenantId", title, "ownerId", status, "dueAt", "createdBy", "updatedAt") values ($1, $2, $3, $4, 'OPEN', $5, $4, now())`, [id, tenantId, `Due ${hours}h`, userId, due.toISOString()]);
      if (localDate(due) === localDate(now)) expected.add(id);
    }

    const range = await getTenantTodayRange(tenantId);
    check(localDate(new Date(range.start)) === localDate(now) && localDate(new Date(new Date(range.end).getTime() - 1)) === localDate(now) && localDate(new Date(new Date(range.start).getTime() - 1)) !== localDate(now), "today's range starts and ends at Auckland midnight");

    const page = await listTasksPageForTenant(user, { due: "today" } as any, 1, 200);
    const got = new Set(page.data.map((task: any) => task.id));
    check(got.size === expected.size && [...expected].every((id) => got.has(id)), `"Due today" returns exactly the ${expected.size} tasks due today in Auckland (got ${got.size})`);

    console.log(`workspace-today-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
