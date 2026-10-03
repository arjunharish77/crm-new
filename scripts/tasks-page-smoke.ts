/**
 * Local-only real-database check for the Tasks page's server paging (UI/UX plan Phase 2):
 *   - the total is the real count, and walking the pages returns every task once (the old list
 *     stopped at 500 rows without saying so);
 *   - the "Open" view, search (case-insensitive, LIKE wildcards taken literally), owner and
 *     priority filters, and Own-record access all apply to both the page and the total;
 *   - the page size is capped.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/tasks-page-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listTasksPageForTenant } from "../src/lib/repositories/tasks-postgres";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Tasks page smoke', now())`, [tenantId]);
    const allRole = randomUUID();
    const ownRole = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke all', '{"recordAccess":"ALL"}', now()), ($3, $2, 'Smoke own', '{"recordAccess":"OWN"}', now())`, [allRole, tenantId, ownRole]);
    const adminId = randomUUID();
    const repId = randomUUID();
    await q(
      `insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, now()), ($5, $2, $6, 'Smoke rep', 'x', $7, now())`,
      [adminId, tenantId, `tasks.${adminId.slice(0, 6)}@smoke.invalid`, allRole, repId, `tasks.${repId.slice(0, 6)}@smoke.invalid`, ownRole],
    );
    const admin = { id: adminId, tenantId, role: { permissions: { recordAccess: "ALL" } } } as any;
    const rep = { id: repId, tenantId, role: { permissions: { recordAccess: "OWN" } } } as any;

    // 61 tasks: alternating owners, a mix of statuses and priorities, a few with searchable titles.
    const statuses = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    for (let index = 0; index < 61; index++) {
      const title = index % 10 === 0 ? `Call back customer ${index}` : index === 7 ? "Discount 100% offer" : `Smoke task ${index}`;
      await q(
        `insert into "Task" (id, "tenantId", title, status, priority, "ownerId", "createdBy", "dueAt", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $6, now() + ($7 || ' hours')::interval, now(), now())`,
        [randomUUID(), tenantId, title, statuses[index % 4], priorities[index % 3], index % 2 ? repId : adminId, String(index - 30)],
      );
    }
    const count = async (where: string, args: unknown[] = []) => Number((await q(`select count(*)::int as n from "Task" where "tenantId" = $1 and ${where}`, [tenantId, ...args])).rows[0].n);

    const first = await listTasksPageForTenant(admin, {}, 1, 25);
    check(first.meta.total === 61 && first.data.length === 25 && first.meta.last_page === 3, "the total is the real count and pages are sized");
    const seen = new Set<string>();
    for (let page = 1; page <= first.meta.last_page; page++) for (const task of (await listTasksPageForTenant(admin, {}, page, 25)).data) seen.add(task.id);
    check(seen.size === 61, "walking the pages returns every task exactly once");

    const open = await listTasksPageForTenant(admin, { open: true }, 1, 100);
    check(open.meta.total === (await count(`status in ('OPEN', 'IN_PROGRESS')`)) && open.data.every((task: any) => ["OPEN", "IN_PROGRESS"].includes(task.status)), "the Open view counts and returns only open or in-progress tasks");

    const search = await listTasksPageForTenant(admin, { q: "CALL BACK" }, 1, 100);
    check(search.meta.total === 7 && search.data.every((task: any) => task.title.startsWith("Call back")), "search is case-insensitive");
    const percent = await listTasksPageForTenant(admin, { q: "100%" }, 1, 100);
    check(percent.meta.total === 1, "a % in the search is matched literally, not as a wildcard");
    const underscore = await listTasksPageForTenant(admin, { q: "_" }, 1, 100);
    check(underscore.meta.total === 0, "an _ in the search is matched literally");

    const mine = await listTasksPageForTenant(admin, { ownerId: adminId, open: true }, 1, 100);
    check(mine.meta.total === (await count(`"ownerId" = $2 and status in ('OPEN', 'IN_PROGRESS')`, [adminId])) && mine.data.every((task: any) => task.ownerId === adminId), "my open tasks");
    const urgent = await listTasksPageForTenant(admin, { priority: "HIGH" }, 1, 100);
    check(urgent.meta.total === (await count(`priority = 'HIGH'`)), "priority filter");

    const byTitle = (await listTasksPageForTenant(admin, { sort: { id: "title", desc: false } } as any, 1, 200)).data.map((task: any) => String(task.title).toLowerCase());
    check(byTitle.length > 1 && byTitle.every((title, index) => index === 0 || byTitle[index - 1] <= title), "sorting by title orders the page by title (server-side)");
    const byTitleDesc = (await listTasksPageForTenant(admin, { sort: { id: "title", desc: true } } as any, 1, 200)).data.map((task: any) => String(task.title).toLowerCase());
    check(byTitleDesc[0] === byTitle[byTitle.length - 1], "and descending reverses it");
    const repAll = await listTasksPageForTenant(rep, {}, 1, 100);
    check(repAll.meta.total === 30 && repAll.data.every((task: any) => task.ownerId === repId), "Own-record access: the page and the total only include the user's tasks");
    const repAskingForAdmin = await listTasksPageForTenant(rep, { ownerId: adminId }, 1, 100);
    check(repAskingForAdmin.meta.total === 0, "Own-record access can't be widened with an owner filter");

    const capped = await listTasksPageForTenant(admin, {}, 1, 10_000);
    check(capped.meta.limit === 200, "the page size is capped at 200");
    const beyond = await listTasksPageForTenant(admin, {}, 99, 25);
    check(beyond.data.length === 0 && beyond.meta.total === 61, "a page past the end is empty and keeps the total");

    console.log(`tasks-page-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
