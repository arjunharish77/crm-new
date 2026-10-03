/**
 * Local-only real-database check for task visibility by record access (decision 2026-10-02):
 *   - Own: only the user's own tasks;
 *   - Team: their own plus tasks owned by members of their team; with no team, only their own;
 *   - All: every task in the tenant;
 * for the list and its total, opening, updating and deleting a task, ticking a checklist item,
 * choosing "blocked by" tasks, and the task export's scope clause. Temporary tenant, removed
 * afterwards.
 * Run: tsx scripts/tasks-scope-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  deleteTaskForTenant,
  getTaskForTenant,
  listTasksPageForTenant,
  setTaskDependenciesForTenant,
  toggleTaskChecklistItemForTenant,
  updateTaskForTenant,
} from "../src/lib/repositories/tasks-postgres";
import { applyTaskScopeClause } from "../src/lib/server/record-scope";

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
  const otherTenantId = randomUUID();
  try {
    for (const [id, name] of [[tenantId, "Task scope smoke"], [otherTenantId, "Task scope smoke (other)"]]) {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
    }
    const teamA = randomUUID();
    const teamB = randomUUID();
    for (const [id, name] of [[teamA, "Team A"], [teamB, "Team B"]]) await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, $3)`, [id, tenantId, name]);
    const roles: Record<string, string> = { ALL: randomUUID(), TEAM: randomUUID(), OWN: randomUUID() };
    for (const [access, id] of Object.entries(roles)) {
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenantId, `Smoke ${access}`, JSON.stringify({ recordAccess: access })]);
    }
    const foreignRole = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke foreign', '{"recordAccess":"ALL"}', now())`, [foreignRole, otherTenantId]);
    const makeUser = async (label: string, access: "ALL" | "TEAM" | "OWN", teamId: string | null, tenant = tenantId) => {
      const id = randomUUID();
      const roleId = tenant === tenantId ? roles[access] : foreignRole;
      await q(
        `insert into "User" (id, "tenantId", email, name, password, "roleId", "teamId", "updatedAt") values ($1, $2, $3, $4, 'x', $5, $6, now())`,
        [id, tenant, `task-scope.${label}.${id.slice(0, 6)}@smoke.invalid`, `Smoke ${label}`, roleId, teamId],
      );
      return { id, tenantId: tenant, teamId, role: { permissions: { recordAccess: access } } } as any;
    };
    const admin = await makeUser("admin", "ALL", null);
    const lead = await makeUser("team-lead", "TEAM", teamA); // Team access, in Team A
    const mate = await makeUser("mate", "OWN", teamA); // also in Team A
    const outsider = await makeUser("outsider", "OWN", teamB); // Team B
    const teamless = await makeUser("teamless", "TEAM", null); // Team access, no team
    const rep = await makeUser("rep", "OWN", teamA); // Own access, in Team A
    // Same team id in another tenant must not widen anything.
    const foreign = await makeUser("foreign", "ALL", null, otherTenantId);
    await q(`update "User" set "teamId" = $1 where id = $2`, [teamA, foreign.id]).catch(() => undefined);

    const tasks: Record<string, string> = {};
    const owners = { lead, mate, outsider, teamless, rep, admin };
    for (const [label, owner] of Object.entries(owners)) {
      tasks[label] = randomUUID();
      await q(
        `insert into "Task" (id, "tenantId", title, status, priority, "ownerId", "createdBy", "createdAt", "updatedAt") values ($1, $2, $3, 'OPEN', 'MEDIUM', $4, $4, now(), now())`,
        [tasks[label], tenantId, `Task of ${label}`, owner.id],
      );
    }
    const foreignTask = randomUUID();
    await q(`insert into "Task" (id, "tenantId", title, status, priority, "ownerId", "createdBy", "createdAt", "updatedAt") values ($1, $2, 'Foreign task', 'OPEN', 'MEDIUM', $3, $3, now(), now())`, [foreignTask, otherTenantId, foreign.id]);
    const itemId = randomUUID();
    await q(`insert into "TaskChecklistItem" (id, "tenantId", "taskId", "itemOrder", title, "isDone", "createdAt", "updatedAt") values ($1, $2, $3, 0, 'Step', false, now(), now())`, [itemId, tenantId, tasks.outsider]);

    const visible = async (user: any) => new Set((await listTasksPageForTenant(user, {}, 1, 200)).data.map((task: any) => task.id));
    const same = (set: Set<string>, labels: string[]) => set.size === labels.length && labels.every((label) => set.has(tasks[label]));

    const leadSees = await visible(lead);
    check(same(leadSees, ["lead", "mate", "rep"]), "Team access: own tasks plus tasks owned by team members, nobody else's");
    check((await listTasksPageForTenant(lead, {}, 1, 1)).meta.total === 3, "Team access: the total counts the same tasks");
    check(same(await visible(teamless), ["teamless"]), "Team access with no team: only their own tasks");
    check(same(await visible(rep), ["rep"]), "Own access: only their own tasks, even inside a team");
    check(same(await visible(admin), Object.keys(owners)), "All access: every task in the tenant, none from another tenant");

    check(!!(await getTaskForTenant(lead, tasks.mate)), "Team access can open a teammate's task");
    check((await getTaskForTenant(lead, tasks.outsider)) === null, "Team access can't open another team's task");
    check((await updateTaskForTenant(lead, tasks.outsider, { title: "Hijacked" })) === null, "Team access can't update another team's task");
    check((await q(`select title from "Task" where id = $1`, [tasks.outsider])).rows[0].title === "Task of outsider", "the other team's task is unchanged");
    check((await deleteTaskForTenant(lead, tasks.outsider)) === null, "Team access can't delete another team's task");
    check((await q(`select count(*)::int n from "Task" where id = $1`, [tasks.outsider])).rows[0].n === 1, "the other team's task still exists");

    await rejects(() => toggleTaskChecklistItemForTenant(lead, tasks.outsider, itemId, true), "TASK_NOT_FOUND", "a checklist item on an invisible task can't be ticked");
    check((await q(`select "isDone" from "TaskChecklistItem" where id = $1`, [itemId])).rows[0].isDone === false, "the checklist item is unchanged");
    await rejects(() => setTaskDependenciesForTenant(lead, tasks.lead, [tasks.outsider]), "TASK_NOT_FOUND", "an invisible task can't be chosen as a blocker");
    await setTaskDependenciesForTenant(lead, tasks.lead, [tasks.mate]);
    check((await q(`select count(*)::int n from "TaskDependency" where "taskId" = $1 and "blockedByTaskId" = $2`, [tasks.lead, tasks.mate])).rows[0].n === 1, "a teammate's task can be a blocker");

    // The export's clause: aliased, with the tenant bound as text, as in exports.ts.
    const exportIds = async (user: any) => {
      const values: unknown[] = [String(user.tenantId)];
      const clauses = [`t."tenantId"::text = $1`];
      applyTaskScopeClause(clauses, values, user, 1, "t");
      return new Set((await q(`select t.id from "Task" t where ${clauses.join(" and ")}`, values)).rows.map((row) => row.id as string));
    };
    check(same(await exportIds(lead), ["lead", "mate", "rep"]), "the export uses the same Team rule");
    check(same(await exportIds(rep), ["rep"]), "the export uses the same Own rule");
    check(same(await exportIds(admin), Object.keys(owners)), "the export uses the same All rule");

    console.log(`tasks-scope-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
