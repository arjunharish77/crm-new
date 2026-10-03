/**
 * Local-only real-database check for call queue access:
 *   - a team's queued calls are visible to its members (the Settings › Teams member list or their
 *     primary team) and supervisors, not to people on other teams;
 *   - queue health lists only the teams a non-supervisor is on; supervisors see every queue;
 *   - someone on another team can't release a claimed call; an admin can (even when their role
 *     only has Own record access), and the release is audit-logged;
 *   - a team from another workspace isn't found;
 *   - queued calls show their lead's name (the list used to fail outright: uuid vs text join).
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/call-queue-access-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { claimQueuedCall, getCallQueueHealthForTenant, listQueuedCallsForTeam, releaseQueuedCall } from "../src/lib/server/call-queues";

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
    for (const id of [tenantId, otherTenantId]) await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Call queue smoke', now())`, [id]);
    const role = async (tenant: string, recordAccess: string) => {
      const id = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenant, `Smoke ${recordAccess}`, { recordAccess }]);
      return id;
    };
    const team = async (tenant: string, name: string) => {
      const id = randomUUID();
      await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, $3)`, [id, tenant, name]);
      return id;
    };
    const person = async (tenant: string, roleId: string, recordAccess: string, extra: { teamId?: string; isTenantAdmin?: boolean } = {}) => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "teamId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, $5, now())`,
        [id, tenant, `queues.${id.slice(0, 8)}@smoke.invalid`, roleId, extra.teamId ?? null]);
      return { id, tenantId: tenant, isTenantAdmin: !!extra.isTenantAdmin, role: { permissions: { recordAccess } } } as any;
    };
    const queueCall = async (teamId: string, leadId: string | null = null) => {
      const id = randomUUID();
      await q(`insert into "TelephonyCallLog" (id, "tenantId", "callId", "queueId", "queueType", "queuedAt", "leadId") values ($1, $2, $3, $4, 'INBOUND', now(), $5)`, [id, tenantId, `smoke-${id}`, teamId, leadId]);
      return id;
    };

    const sales = await team(tenantId, "Smoke sales");
    const support = await team(tenantId, "Smoke support");
    const foreignTeam = await team(otherTenantId, "Other workspace team");
    const ownRole = await role(tenantId, "OWN");
    const listedMember = await person(tenantId, ownRole, "OWN");
    await q(`insert into "TeamMember" (id, "tenantId", "teamId", "userId") values ($1, $2, $3, $4)`, [randomUUID(), tenantId, sales, listedMember.id]);
    const primaryMember = await person(tenantId, ownRole, "OWN", { teamId: sales });
    const otherTeamRep = await person(tenantId, ownRole, "OWN", { teamId: support });
    const supervisor = await person(tenantId, await role(tenantId, "ALL"), "ALL");
    const admin = await person(tenantId, ownRole, "OWN", { isTenantAdmin: true });
    const objectId = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectId, tenantId]);
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Queued caller', now())`, [leadId, tenantId, objectId]);
    const salesCall = await queueCall(sales);
    await queueCall(sales, leadId);
    await queueCall(support);

    const salesQueue: any[] = await listQueuedCallsForTeam(listedMember, sales);
    check(salesQueue.length === 2, "a member on the team's member list sees its queue");
    check(salesQueue.some((call) => call.leadName === "Queued caller"), "a queued call shows its lead's name");
    check((await listQueuedCallsForTeam(primaryMember, sales)).length === 2, "a member whose primary team it is sees its queue");
    await rejects(() => listQueuedCallsForTeam(otherTeamRep, sales), "FORBIDDEN", "someone on another team can't read the queue");
    check((await listQueuedCallsForTeam(supervisor, support)).length === 1, "a supervisor sees any team's queue");
    await rejects(() => listQueuedCallsForTeam(supervisor, foreignTeam), "TEAM_NOT_FOUND", "another workspace's team isn't found");

    const repHealth = await getCallQueueHealthForTenant(otherTeamRep);
    check(repHealth.length === 1 && repHealth[0].teamId === support, "queue health shows a rep only their own team");
    const supervisorHealth = await getCallQueueHealthForTenant(supervisor);
    check(supervisorHealth.length === 2, "queue health shows a supervisor every queue");

    const claimed = await claimQueuedCall(listedMember, salesCall);
    check(claimed?.claimedBy === listedMember.id, "a listed member can claim a call");
    await rejects(() => releaseQueuedCall(otherTeamRep, salesCall), "FORBIDDEN", "someone on another team can't release it");
    const released = await releaseQueuedCall(admin, salesCall);
    check(released?.claimedBy === null, "an admin with Own record access can release it");
    const audit = await q(`select action from "AuditLog" where "tenantId" = $1 and "entityId" = $2 order by "createdAt"`, [tenantId, salesCall]);
    check(audit.rows.map((row) => row.action).join(",") === "CLAIM,RELEASE", "claim and release are both audit-logged");

    console.log(`call-queue-access-smoke: ${checks} checks passed`);
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
