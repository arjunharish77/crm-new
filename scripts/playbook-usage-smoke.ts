/**
 * Local-only real-database check for task playbook usage (deferred item, 2026-10-03):
 *   - usage counts applications (in total, in the last 30 days, by hand and automatically) and
 *     lists the latest with their record, who applied them, and how many tasks are done;
 *   - another workspace's playbook isn't found.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/playbook-usage-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { applyTaskPlaybookForTenant, createTaskPlaybookForTenant, getTaskPlaybookUsageForTenant } from "../src/lib/repositories/task-playbooks-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  try {
    const setUp = async (id: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Playbook usage smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke Admin', 'x', $4, now())`, [userId, id, `playbook.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id: userId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const user = await setUp(tenantId);
    const outsider = await setUp(otherTenantId);
    const objectId = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectId, tenantId]);
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, "ownerId", "updatedAt") values ($1, $2, $3, 'Usage lead', $4, now())`, [leadId, tenantId, objectId, user.id]);

    const playbook: any = await createTaskPlaybookForTenant(user, { name: "Welcome", targetModule: "LEAD", items: [{ title: "Call", dueInDays: 1 }, { title: "Email", dueInDays: 2 }] } as any);
    const first: any = await applyTaskPlaybookForTenant(user, playbook.id, { leadId });
    await applyTaskPlaybookForTenant(user, playbook.id, { leadId, source: "AUTOMATION" });
    await q(`update "TaskPlaybookApplication" set "createdAt" = now() - interval '45 days' where id <> $1 and "playbookId" = $2`, [first.application.id, playbook.id]);
    await q(`update "Task" set status = 'COMPLETED' where id = $1`, [first.tasks[0].id]);

    const usage: any = await getTaskPlaybookUsageForTenant(user, playbook.id);
    check(usage.total === 2 && usage.last30 === 1 && usage.manual === 1 && usage.automatic === 1, "usage counts applications in total, in the last 30 days, by hand and automatically");
    const latest = usage.recent[0];
    check(latest.leadName === "Usage lead" && latest.appliedByName === "Smoke Admin" && latest.taskCount === 2 && latest.completedCount === 1, "the latest application shows its record, who applied it and 1 of 2 tasks done");
    await assert.rejects(() => getTaskPlaybookUsageForTenant(outsider, playbook.id), (error: any) => error?.message === "PLAYBOOK_NOT_FOUND");
    checks++; // another workspace can't see it

    console.log(`playbook-usage-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (const id of [tenantId, otherTenantId]) {
      for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [id]).catch(() => undefined);
      await q(`delete from "Tenant" where id = $1`, [id]);
    }
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
