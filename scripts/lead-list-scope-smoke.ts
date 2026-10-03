/**
 * Local-only real-database check that lead lists respect record access:
 *   - a static list shows a user only the leads they may see, and counts the rest;
 *   - adding leads the user can't see (someone else's under Own access, or another workspace's)
 *     is refused; adding their own works;
 *   - All-records access sees every member.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/lead-list-scope-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { addLeadsToLeadListForTenant, getLeadListForTenant } from "../src/lib/repositories/lead-lists-postgres";

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
    const objectIds: Record<string, string> = {};
    for (const id of [tenantId, otherTenantId]) {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'List scope smoke', now())`, [id]);
      objectIds[id] = randomUUID();
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectIds[id], id]);
    }
    const role = async (tenant: string, recordAccess: string) => {
      const id = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenant, `Smoke ${recordAccess}`, { recordAccess, modules: { leads: "write" } }]);
      return id;
    };
    const person = async (tenant: string, roleId: string, recordAccess: string) => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenant, `lists.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId: tenant, role: { permissions: { recordAccess } } } as any;
    };
    const lead = async (tenant: string, ownerId: string | null, name: string) => {
      const id = randomUUID();
      await q(`insert into "Lead" (id, "tenantId", "objectId", name, "ownerId", "updatedAt") values ($1, $2, $3, $4, $5, now())`, [id, tenant, objectIds[tenant], name, ownerId]);
      return id;
    };
    const ownRole = await role(tenantId, "OWN");
    const allRole = await role(tenantId, "ALL");
    const rep = await person(tenantId, ownRole, "OWN");
    const colleague = await person(tenantId, ownRole, "OWN");
    const manager = await person(tenantId, allRole, "ALL");
    const outsider = await person(otherTenantId, await role(otherTenantId, "ALL"), "ALL");
    const mine = await lead(tenantId, rep.id, "My lead");
    const theirs = await lead(tenantId, colleague.id, "Their lead");
    const foreign = await lead(otherTenantId, outsider.id, "Other workspace lead");

    const listId = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, "updatedAt") values ($1, $2, 'Smoke list', 'STATIC', now())`, [listId, tenantId]);
    await addLeadsToLeadListForTenant(manager, listId, [mine, theirs]);

    const asRep: any = await getLeadListForTenant(rep, listId);
    check(asRep.leads.length === 1 && asRep.leads[0].id === mine && asRep.count === 2 && asRep.hiddenCount === 1, "Own access sees only their own member and a count of the hidden one");
    const asManager: any = await getLeadListForTenant(manager, listId);
    check(asManager.leads.length === 2 && asManager.hiddenCount === 0, "All-records access sees every member");

    const listTwo = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, "updatedAt") values ($1, $2, 'Smoke list two', 'STATIC', now())`, [listTwo, tenantId]);
    await rejects(() => addLeadsToLeadListForTenant(rep, listTwo, [theirs]), "LEADS_NOT_VISIBLE", "adding someone else's lead under Own access is refused");
    await rejects(() => addLeadsToLeadListForTenant(manager, listTwo, [foreign]), "LEADS_NOT_VISIBLE", "adding another workspace's lead is refused");
    const added: any = await addLeadsToLeadListForTenant(rep, listTwo, [mine]);
    check(added.addedLeadIds.length === 1, "adding their own lead works");

    console.log(`lead-list-scope-smoke: ${checks} checks passed`);
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
