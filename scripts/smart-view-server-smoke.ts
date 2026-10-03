/**
 * Local-only real-database check that Smart View filters run on the server:
 *   - with 6,000 leads, the five that match are older than the newest 5,000 (where the browser
 *     filtering used to stop) and are still found, with the exact total;
 *   - "owner: someone else" includes unowned leads, "owner: me" doesn't;
 *   - a filter the server can't apply is refused (strict), never skipped;
 *   - activities search and sort on the server;
 *   - % and _ in a "contains" filter are literal characters.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/smart-view-server-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listLeadsForTenant } from "../src/lib/repositories/leads-postgres";
import { listActivitiesForTenant } from "../src/lib/repositories/activities-postgres";
import { toServerQuery } from "../src/components/views/smart-view-server-query";

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
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Smart View smoke', now())`, [tenantId]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Manager', '{"recordAccess":"ALL"}', now())`, [roleId, tenantId]);
    const person = async () => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `views.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const me = await person();
    const colleague = await person();
    const leadObject = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'lead', 'Lead', now())`, [leadObject, tenantId]);
    // 6,000 leads: every third mine, every third a colleague's, every third unowned. The five
    // "Partner" leads are the oldest, so they sit past the newest 5,000.
    await q(
      `insert into "Lead" (id, "tenantId", "objectId", name, source, "ownerId", "createdAt", "updatedAt")
       select gen_random_uuid()::text, $1, $2, 'Lead ' || n, case when n <= 5 then 'Partner' else 'Web' end,
              case n % 3 when 0 then $3 when 1 then $4 else null end,
              now() - make_interval(mins => 6001 - n) - interval '1 day' * (case when n <= 5 then 30 else 0 end), now()
       from generate_series(1, 6000) as n`,
      [tenantId, leadObject, me.id, colleague.id],
    );
    const list = async (filters: any, options: any = {}, limit = 50) => listLeadsForTenant(me, 1, limit, filters, { strictFilters: true, ...options });

    const partner = toServerQuery("LEADS", { logic: "AND", conditions: [{ id: "c", field: "source", operator: "equals", value: "Partner" }] });
    assert.ok(partner.ok);
    const partners = await list([partner.group]);
    check(partners.meta.total === 5 && partners.data.length === 5, "matches older than the newest 5,000 leads are found, with the exact total");

    const counts = (await q(`select count(*) filter (where "ownerId" = $2)::int as mine, count(*) filter (where "ownerId" is distinct from $2)::int as others from "Lead" where "tenantId" = $1`, [tenantId, me.id])).rows[0];
    const segment = (value: string) => toServerQuery("LEADS", { logic: "AND", conditions: [{ id: "s", field: "ownerSegment", operator: "equals", value }] }) as any;
    check((await list([segment("CURRENT_USER").group], {}, 1)).meta.total === counts.mine, "owner: me counts only my leads");
    check((await list([segment("OTHER").group], {}, 1)).meta.total === counts.others && counts.others === 4000, "owner: someone else includes unowned leads");

    await assert.rejects(() => list([{ logic: "AND", conditions: [{ field: "pendingNbaCount", operator: "greater_than", value: 0 }] }]), (error: any) => error?.message === "FILTER_UNSUPPORTED" && error.field === "pendingNbaCount");
    checks++; // a filter the server can't apply is refused, not skipped
    check((await listLeadsForTenant(me, 1, 1, [{ logic: "AND", conditions: [{ field: "pendingNbaCount", operator: "greater_than", value: 0 }] } as any])).meta.total === 6000, "(without strict, the old lists still skip it as before)");

    const searched = await list([partner.group], { search: "Lead 3" });
    check(searched.meta.total === 1 && searched.data[0].name === "Lead 3", "search narrows the server result");

    for (const name of ["Promo 50% off", "Promo 500 off"]) {
      await q(`insert into "Lead" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, $4, now())`, [randomUUID(), tenantId, leadObject, name]);
    }
    const percent = await list([{ logic: "AND", conditions: [{ field: "name", operator: "contains", value: "50%" }] }]);
    check(percent.meta.total === 1 && percent.data[0].name === "Promo 50% off", "a % in \"contains\" is a literal character, not a wildcard");

    const typeId = randomUUID();
    const activityObject = randomUUID();
    await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, 'activity', 'Activity', now())`, [activityObject, tenantId]);
    await q(`insert into "ActivityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Call', now())`, [typeId, tenantId, activityObject]);
    for (const [notes, days] of [["Called about pricing", 3], ["Sent brochure", 1], ["Pricing follow-up", 2]] as const) {
      await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", notes, "dueAt", "createdBy", "updatedAt") values ($1, $2, $3, $4, $5, now() + make_interval(days => $6), $7, now())`,
        [randomUUID(), tenantId, activityObject, typeId, notes, days, me.id]);
    }
    const activities = await listActivitiesForTenant(me, 50, null, 1, { search: "pricing", sort: { id: "dueAt", desc: false }, strictFilters: true });
    check(activities.meta.total === 2 && activities.data.map((row: any) => row.notes).join("|") === "Pricing follow-up|Called about pricing", "activities search and sort on the server");

    console.log(`smart-view-server-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
