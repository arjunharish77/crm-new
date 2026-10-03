/**
 * Local-only real-database check for the last Smart View modules that loaded everything (Section 8
 * #4):
 *   - tasks take grouped filter conditions on the server (title, status, priority, owner, due
 *     date, ...), with "@me" resolved to the signed-in person and record access still applied;
 *     strict mode refuses a field it can't apply instead of skipping it (which would widen the
 *     result);
 *   - the paged task list reaches every task (the unpaged call stopped at 500);
 *   - payouts list every cycle, newest first, one page at a time with the total (a Payouts tab
 *     read only the newest cycle).
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/smart-view-tasks-payouts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listTasksPageForTenant } from "../src/lib/repositories/tasks-postgres";
import { listPayoutsPageForTenant } from "../src/lib/server/payouts";
import { UnsupportedFilterError } from "../src/lib/query-filters";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Smart view tasks payouts smoke', now())`, [tenantId]);
    const person = async (recordAccess: "ALL" | "OWN") => {
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [roleId, tenantId, `Smoke ${recordAccess} ${roleId.slice(0, 6)}`, { recordAccess }]);
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `sv.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: recordAccess === "ALL", role: { permissions: { recordAccess } } } as any;
    };
    const admin = await person("ALL");
    const rep = await person("OWN");

    // 700 tasks: every 7th is the rep's and HIGH priority; titles "Task 0001" … "0700".
    await q(
      `insert into "Task" (id, "tenantId", title, status, priority, "ownerId", "createdBy", "dueAt", "updatedAt")
       select gen_random_uuid()::text, $1, 'Task ' || lpad(n::text, 4, '0'), case when n % 2 = 0 then 'COMPLETED' else 'OPEN' end,
              case when n % 7 = 0 then 'HIGH' else 'MEDIUM' end, case when n % 7 = 0 then $2 else $3 end, $3, now() + (n || ' hours')::interval, now()
       from generate_series(1, 700) as n`,
      [tenantId, rep.id, admin.id],
    );
    const all = await listTasksPageForTenant(admin, { strict: true }, 4, 200);
    check(all.meta.total === 700 && all.data.length === 100, "paging reaches all 700 tasks (the unpaged list stopped at 500)");
    const mineHigh = await listTasksPageForTenant(rep, { strict: true, groups: [{ logic: "AND", conditions: [{ field: "ownerId", operator: "equals", value: "@me" }, { field: "priority", operator: "equals", value: "HIGH" }] }] }, 1, 200);
    check(mineHigh.meta.total === 100 && mineHigh.data.every((task: any) => task.ownerId === rep.id), '"@me" and priority filter on the server');
    const adminsView = await listTasksPageForTenant(admin, { strict: true, groups: [{ logic: "AND", conditions: [{ field: "ownerId", operator: "equals", value: rep.id }, { field: "status", operator: "equals", value: "OPEN" }] }] }, 1, 200);
    check(adminsView.meta.total === 50, "an admin filters by someone else's tasks and status");
    const repSeesOnlyOwn = await listTasksPageForTenant(rep, { strict: true, groups: [{ logic: "AND", conditions: [{ field: "ownerId", operator: "equals", value: admin.id }] }] }, 1, 200);
    check(repSeesOnlyOwn.meta.total === 0, "filters never widen record access");
    const byTitle = await listTasksPageForTenant(admin, { strict: true, groups: [{ logic: "OR", conditions: [{ field: "title", operator: "contains", value: "Task 069" }, { field: "title", operator: "equals", value: "Task 0001" }] }] }, 1, 200);
    check(byTitle.meta.total === 11, "OR groups work");
    await assert.rejects(() => listTasksPageForTenant(admin, { strict: true, groups: [{ logic: "AND", conditions: [{ field: "description", operator: "contains", value: "x" }] }] }), UnsupportedFilterError, "strict refuses a field it can't apply");
    checks++;

    // Payouts across 3 cycles (2, 3 and 1 payouts), newest cycle first.
    const cycles: string[] = [];
    for (const [index, label] of ["July", "August", "September"].entries()) {
      const id = randomUUID();
      cycles.push(id);
      await q(`insert into "PayoutCycle" (id, "tenantId", "cycleLabel", "startDate", "endDate") values ($1, $2, $3, now() - interval '90 days' + ($4 || ' days')::interval, now() - interval '60 days' + ($4 || ' days')::interval)`, [id, tenantId, label, index * 30]);
    }
    // One payout per partner per cycle, so three partner logins.
    const partners = [admin.id, rep.id, (await person("OWN")).id];
    for (const [cycle, count] of [[cycles[0], 2], [cycles[1], 3], [cycles[2], 1]] as const) {
      for (let i = 0; i < count; i++) await q(`insert into "Payout" (id, "tenantId", "payoutCycleId", "partnerId", "totalCommissionAmount") values ($1, $2, $3, $4, $5)`, [randomUUID(), tenantId, cycle, partners[i], 100 + i]);
    }
    const firstPage = await listPayoutsPageForTenant(admin, 1, 4);
    check(firstPage.meta.total === 6 && firstPage.data.length === 4 && firstPage.data[0].cycleLabel === "September", "payouts list every cycle with the total, newest cycle first");
    const secondPage = await listPayoutsPageForTenant(admin, 2, 4);
    check(secondPage.data.length === 2 && secondPage.data.every((payout: any) => payout.cycleLabel === "July"), "and page on to the oldest");

    console.log(`smart-view-tasks-payouts-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
