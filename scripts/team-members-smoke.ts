/**
 * Local-only real-database check for adding team members (Settings › Teams):
 *   - someone from this workspace can be added once; adding them again is refused clearly;
 *   - a user or a team from another workspace is refused (foreign keys alone don't check that).
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/team-members-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { addTeamMemberForTenant } from "../src/lib/repositories/admin-modules-postgres";

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
    const setUp = async (id: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Team members smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `team.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      const teamId = randomUUID();
      await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, 'Smoke team')`, [teamId, id]);
      return { admin: { id: userId, tenantId: id, isTenantAdmin: true } as any, userId, teamId };
    };
    const a = await setUp(tenantId);
    const b = await setUp(otherTenantId);

    const added = await addTeamMemberForTenant(a.admin, a.teamId, { userId: a.userId });
    check(added?.userId === a.userId, "someone from this workspace can be added to its team");
    await rejects(() => addTeamMemberForTenant(a.admin, a.teamId, { userId: a.userId }), "ALREADY_TEAM_MEMBER", "adding them again is refused clearly");
    await rejects(() => addTeamMemberForTenant(a.admin, a.teamId, { userId: b.userId }), "USER_NOT_FOUND", "a user from another workspace can't be added");
    await rejects(() => addTeamMemberForTenant(a.admin, b.teamId, { userId: a.userId }), "TEAM_NOT_FOUND", "another workspace's team can't be used");
    check(Number((await q(`select count(*)::int n from "TeamMember" where "teamId"::text = $1`, [b.teamId])).rows[0].n) === 0, "the other workspace's team is untouched");

    console.log(`team-members-smoke: ${checks} checks passed`);
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
