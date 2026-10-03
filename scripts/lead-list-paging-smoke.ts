/**
 * Local-only real-database check that a list's page loads one page of leads at a time (Section 8
 * #4: a static list loaded every member and a smart list its first 500):
 *   - static list: pages in the order leads were added (newest first), with `total` = members this
 *     person can see, `count` = all members and `hiddenCount` = members their role can't see;
 *   - search runs on the server across every member, not just the page;
 *   - smart list: paging reaches past the old 500-lead cap, and `count` stays the whole list while
 *     a search narrows `total`.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/lead-list-paging-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { getLeadListPageForTenant } from "../src/lib/repositories/lead-lists-postgres";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Lead list paging smoke', now())`, [tenantId]);
    const person = async (recordAccess: "ALL" | "OWN") => {
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [roleId, tenantId, `Smoke ${recordAccess}`, { recordAccess }]);
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `lists.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: recordAccess === "ALL", role: { permissions: { recordAccess } } } as any;
    };
    const admin = await person("ALL");
    const rep = await person("OWN");
    const objectId = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [objectId, tenantId]);

    // 620 leads: "Paging lead 0001" … "0620"; every 10th is owned by the rep, the rest by the admin.
    const ids: string[] = [];
    for (let i = 1; i <= 620; i++) ids.push(randomUUID());
    await q(
      `insert into "Lead" (id, "tenantId", "objectId", name, source, "ownerId", "createdBy", "updatedAt", tags)
       select id, $2, $3, 'Paging lead ' || lpad(n::text, 4, '0'), 'Smoke paging', case when n % 10 = 0 then $4 else $5 end, $5, now(), '{}'
       from unnest($1::text[]) with ordinality as t(id, n)`,
      [ids, tenantId, objectId, rep.id, admin.id],
    );

    // A static list with the first 60 leads, added one second apart (lead 60 added last).
    const staticId = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, "isActive", "createdBy", "updatedAt") values ($1, $2, 'Static paging', 'STATIC', true, $3, now())`, [staticId, tenantId, admin.id]);
    await q(
      `insert into "LeadListMember" (id, "tenantId", "listId", "leadId", "addedBy", "createdAt")
       select gen_random_uuid(), $2, $3::uuid, id, $4, now() - ((61 - n) || ' seconds')::interval
       from unnest($1::text[]) with ordinality as t(id, n) where n <= 60`,
      [ids, tenantId, staticId, admin.id],
    );
    const first = await getLeadListPageForTenant(admin, staticId, { page: 1, limit: 25 });
    check(first && first.leads.length === 25 && first.total === 60 && first.count === 60 && first.hiddenCount === 0, "a static list returns one page and the full totals");
    check(first!.leads[0].name === "Paging lead 0060" && first!.leads[24].name === "Paging lead 0036", "newest addition first");
    const third = await getLeadListPageForTenant(admin, staticId, { page: 3, limit: 25 });
    check(third!.leads.length === 10 && third!.leads[9].name === "Paging lead 0001", "the last page has the rest");
    const searched = await getLeadListPageForTenant(admin, staticId, { page: 1, limit: 25, search: "lead 000" });
    check(searched!.total === 9 && searched!.count === 60 && searched!.leads.every((lead: any) => /Paging lead 000[1-9]/.test(lead.name)), "search covers every member, not just the loaded page");
    const forRep = await getLeadListPageForTenant(rep, staticId, { page: 1, limit: 25 });
    check(forRep!.total === 6 && forRep!.count === 60 && forRep!.hiddenCount === 54 && forRep!.leads.length === 6, "a rep sees only their own members; the rest are counted as hidden");
    const capped = await getLeadListPageForTenant(admin, staticId, { page: 1, limit: 5000 });
    check(capped!.limit === 100 && capped!.leads.length === 60, "a page is at most 100 leads");

    // A smart list matching all 620 (source = Smoke paging).
    const smartId = randomUUID();
    await q(`insert into "LeadList" (id, "tenantId", name, type, filters, "isActive", "createdBy", "updatedAt") values ($1, $2, 'Smart paging', 'SMART', $3, true, $4, now())`, [smartId, tenantId, JSON.stringify([{ logic: "AND", conditions: [{ field: "source", operator: "equals", value: "Smoke paging" }] }]), admin.id]);
    const last = await getLeadListPageForTenant(admin, smartId, { page: 7, limit: 100 });
    check(last!.total === 620 && last!.count === 620 && last!.leads.length === 20, "a smart list pages past the old 500 cap");
    const smartSearch = await getLeadListPageForTenant(admin, smartId, { page: 1, limit: 25, search: "lead 06" });
    check(smartSearch!.total === 21 && smartSearch!.count === 620, "search narrows the total, the list count stays");

    check((await getLeadListPageForTenant(admin, randomUUID())) === null, "an unknown list is null (404)");
    console.log(`lead-list-paging-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
