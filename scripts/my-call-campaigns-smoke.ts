/**
 * Local-only real-database check for "My campaigns" on the Call center page (UI/UX plan §5.14):
 *   - only ACTIVE campaigns are listed;
 *   - a campaign with no assigned team is listed for everyone; one assigned to a team is listed
 *     for that team's members and for supervisors (Team or All record access), not for others;
 *   - the list agrees with the next-call endpoint (someone not listed is refused there);
 *   - "due now" counts pending members and queued members whose retry time has come;
 *   - another workspace's campaigns never appear.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/my-call-campaigns-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { getNextCampaignCallForAgent, listMyCallCampaigns } from "../src/lib/server/call-campaigns";

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
    const makeUser = async (tenant: string, roleId: string, recordAccess: string, teamId: string | null) => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "teamId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, $5, now())`,
        [id, tenant, `calls.${id.slice(0, 8)}@smoke.invalid`, roleId, teamId]);
      return { id, tenantId: tenant, role: { permissions: { recordAccess } } } as any;
    };
    const campaign = async (tenant: string, name: string, status: string, teamId: string | null) => {
      const id = randomUUID();
      await q(`insert into "CallCampaign" (id, "tenantId", name, module, "audienceType", status, "assignedTeamId") values ($1, $2, $3, 'LEAD', 'MANUAL', $4, $5)`, [id, tenant, name, status, teamId]);
      return id;
    };

    for (const [id, name] of [[tenantId, "Calls smoke"], [otherTenantId, "Calls smoke (other)"]]) {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
    }
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Agent', '{"recordAccess":"OWN"}', now())`, [roleId, tenantId]);
    const teamId = randomUUID();
    await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, 'Smoke team')`, [teamId, tenantId]);

    const teamAgent = await makeUser(tenantId, roleId, "OWN", teamId);
    const otherAgent = await makeUser(tenantId, roleId, "OWN", null);
    const supervisor = await makeUser(tenantId, roleId, "TEAM", null);

    const open = await campaign(tenantId, "A open campaign", "ACTIVE", null);
    const teamOnly = await campaign(tenantId, "B team campaign", "ACTIVE", teamId);
    await campaign(tenantId, "C draft campaign", "DRAFT", null);
    await campaign(tenantId, "D paused campaign", "PAUSED", null);
    const otherRole = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Agent', '{}', now())`, [otherRole, otherTenantId]);
    await campaign(otherTenantId, "Other workspace campaign", "ACTIVE", null);

    const member = (status: string, nextEligible: string | null) =>
      q(`insert into "CallCampaignMember" (id, "tenantId", "campaignId", status, "nextEligibleAt") values ($1, $2, $3, $4, $5)`, [randomUUID(), tenantId, open, status, nextEligible]);
    await member("PENDING", null);
    await member("PENDING", null);
    await member("QUEUED", new Date(Date.now() - 60_000).toISOString());
    await member("QUEUED", new Date(Date.now() + 3_600_000).toISOString());
    await member("COMPLETED", null);

    const names = async (user: any) => (await listMyCallCampaigns(user)).map((row: any) => row.name).join(" | ");
    check(await names(teamAgent) === "A open campaign | B team campaign", "a team member sees open campaigns and their team's");
    check(await names(otherAgent) === "A open campaign", "someone outside the team sees only campaigns with no team");
    check(await names(supervisor) === "A open campaign | B team campaign", "a supervisor sees team campaigns too");
    check(!(await names(teamAgent)).includes("draft") && !(await names(teamAgent)).includes("paused"), "only active campaigns are listed");
    check(!(await names(teamAgent)).includes("Other workspace"), "another workspace's campaigns never appear");

    const openRow = (await listMyCallCampaigns(otherAgent)).find((row: any) => row.id === open) as any;
    check(openRow.dueNow === 3, "due now counts pending members and queued members whose retry time has come");

    await assert.rejects(() => getNextCampaignCallForAgent(otherAgent, teamOnly), (error: any) => error?.message === "FORBIDDEN");
    checks++; // the next-call endpoint refuses what the list leaves out

    console.log(`my-call-campaigns-smoke: ${checks} checks passed`);
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
