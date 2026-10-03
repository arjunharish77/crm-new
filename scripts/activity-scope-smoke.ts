/**
 * Local-only real-database check for activity and global-search record access (UI/UX plan step 0):
 *   - a lead timeline's single filter object returns only that lead's activities (it used to be
 *     dropped, returning every activity in the tenant);
 *   - Own/Team users see an activity only when its linked lead or opportunity is visible to them
 *     (owned, team-owned or shared); unlinked activities are visible to "All records" roles only;
 *   - Own/Team users can't create an unlinked activity, link one to a record they can't see, or
 *     edit one outside their scope (reported as not found);
 *   - global search applies the same access to leads, opportunities, activities and tasks,
 *     leaves out merged leads, and returns partners to admins only;
 *   - "select all N matching" ids (UI/UX plan B8) follow the same filters and access as the list,
 *     and report when more than the cap match.
 * Temporary tenant and users, removed afterwards.
 * Run: tsx scripts/activity-scope-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  createActivityForTenant,
  getActivityStatsForTenant,
  listActivitiesForTenant,
  updateActivityForTenant,
} from "../src/lib/repositories/activities-postgres";
import { searchTenantData } from "../src/lib/server/crm";
import { listActivityIdsForTenant } from "../src/lib/repositories/activities-postgres";
import { listLeadIdsForTenant } from "../src/lib/repositories/leads-postgres";
import { listOpportunityIdsForTenant } from "../src/lib/repositories/opportunities-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, label);
    checks++;
  };

  const tenantId = randomUUID();
  const now = new Date().toISOString();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Activity scope smoke', now())`, [tenantId]);
    const object = async (name: string) => {
      const id = randomUUID();
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "isCustom", "createdAt", "updatedAt") values ($1, $2, $3, $3, false, $4, $4)`, [id, tenantId, name, now]);
      return id;
    };
    const [leadObject, opportunityObject, activityObject] = [await object("lead"), await object("opportunity"), await object("activity")];
    const activityType = randomUUID();
    await q(`insert into "ActivityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Call', now())`, [activityType, tenantId, activityObject]);
    const opportunityType = randomUUID();
    await q(`insert into "OpportunityType" (id, "tenantId", "objectId", name, "updatedAt") values ($1, $2, $3, 'Admission', now())`, [opportunityType, tenantId, opportunityObject]);
    const stage = randomUUID();
    await q(`insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", "updatedAt") values ($1, $2, $3, 'New', 1, now())`, [stage, tenantId, opportunityType]);

    const [teamA, teamB] = [randomUUID(), randomUUID()];
    for (const [id, name] of [[teamA, "Team A"], [teamB, "Team B"]]) await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, $3)`, [id, tenantId, name]);

    const role = async (permissions: Record<string, unknown>) => {
      const id = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [id, tenantId, `Smoke ${id.slice(0, 6)}`, permissions]);
      return { id, permissions };
    };
    const [allRole, teamRole, ownRole, partnerRole] = [
      await role({ recordAccess: "ALL" }),
      await role({ recordAccess: "TEAM" }),
      await role({ recordAccess: "OWN" }),
      await role({ isPartnerRole: true }),
    ];
    const user = async (label: string, r: { id: string; permissions: any }, teamId: string | null, extra: Record<string, unknown> = {}) => {
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "teamId", "updatedAt") values ($1, $2, $3, $4, 'x', $5, $6, now())`, [id, tenantId, `${label}.${id.slice(0, 6)}@smoke.invalid`, `Smoke ${label}`, r.id, teamId]);
      return { id, tenantId, teamId, role: { permissions: r.permissions }, ...extra };
    };
    const admin = await user("admin", allRole, null, { isTenantAdmin: true });
    const manager = await user("manager", teamRole, teamA);
    const repA = await user("repa", ownRole, teamA);
    const repA2 = await user("repa2", ownRole, teamA);
    const repB = await user("repb", ownRole, teamB);
    const partner = await user("partner", partnerRole, null);

    const lead = async (name: string, ownerId: string, mergedIntoId: string | null = null) => {
      const id = randomUUID();
      await q(`insert into "Lead" (id, "tenantId", "objectId", name, "ownerId", "mergedIntoId", "updatedAt") values ($1, $2, $3, $4, $5, $6, now())`, [id, tenantId, leadObject, name, ownerId, mergedIntoId]);
      return id;
    };
    const leadA = await lead("Scopesmoke Asha", repA.id);
    const leadA2 = await lead("Scopesmoke Arun", repA2.id);
    const leadB = await lead("Scopesmoke Bala", repB.id);
    const leadShared = await lead("Scopesmoke Shared", repB.id);
    await lead("Scopesmoke Merged", repA.id, leadA);
    await q(`insert into "RecordShare" (id, "tenantId", "recordType", "recordId", "sharedUserIds", "sharedTeamIds") values ($1, $2, 'LEAD', $3, $4, '{}')`, [randomUUID(), tenantId, leadShared, [repA.id]]);
    const oppB = randomUUID();
    await q(`insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, "ownerId", "updatedAt") values ($1, $2, $3, $4, $5, $6, 'Scopesmoke deal', $7, now())`, [oppB, tenantId, opportunityObject, leadB, opportunityType, stage, repB.id]);

    const activity = async (notes: string, leadId: string | null, opportunityId: string | null = null) => {
      const id = randomUUID();
      await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", "opportunityId", notes, "createdBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, $8, now())`, [id, tenantId, activityObject, activityType, leadId, opportunityId, notes, admin.id]);
      return id;
    };
    const actA = await activity("Scopesmoke call A", leadA);
    const actA2 = await activity("Scopesmoke call A2", leadA2);
    const actB = await activity("Scopesmoke call B", leadB);
    const actOppB = await activity("Scopesmoke call opp B", null, oppB);
    const actShared = await activity("Scopesmoke call shared", leadShared);
    const actUnlinked = await activity("Scopesmoke call unlinked", null);
    await q(`insert into "Task" (id, "tenantId", title, "ownerId") values ($1, $2, 'Scopesmoke task A', $3), ($4, $2, 'Scopesmoke task B', $5)`, [randomUUID(), tenantId, repA.id, randomUUID(), repB.id]);
    await q(`insert into "PartnerProfile" (id, "tenantId", "userId", "legalBusinessName") values ($1, $2, $3, 'Scopesmoke Partners Pvt')`, [randomUUID(), tenantId, partner.id]);

    const visible = async (u: any, filters: any = null) => new Set((await listActivitiesForTenant(u, 500, filters)).data.map((a: any) => a.id));
    const same = (actual: Set<string>, expected: string[]) => actual.size === expected.length && expected.every((id) => actual.has(id));

    // --- The timeline filter: one group object, as the lead page and record preview send it.
    const leadFilter = { logic: "AND", conditions: [{ field: "leadId", operator: "equals", value: leadB }] };
    check(same(await visible(admin, leadFilter), [actB]), "a single filter object returns only that lead's activities");
    check(same(await visible(admin, [leadFilter]), [actB]), "the same filter as an array still works");

    // --- Visibility by access level.
    const everything = [actA, actA2, actB, actOppB, actShared, actUnlinked];
    check(same(await visible(admin), everything), "All records: every activity, including unlinked ones");
    check(same(await visible(repA), [actA, actShared]), "Own records: own lead's activity plus the lead shared with them");
    check(same(await visible(manager), [actA, actA2]), "Team records: activities on the team's leads only");
    check(same(await visible(repB), [actB, actOppB, actShared]), "Own records: an activity linked only to an own opportunity is visible");
    check((await visible(partner)).size === 0, "partner role: nothing it doesn't own");
    check(same(await visible(repA, leadFilter), []), "a filter can't reach another rep's lead");
    const stats = await getActivityStatsForTenant(repA as any);
    check(JSON.stringify(stats).length > 0, "stats run with the scoped filter");

    // --- Create and update rules.
    await rejects(() => createActivityForTenant(repA, { typeId: activityType }), "ACTIVITY_LINK_REQUIRED", "Own user can't create an unlinked activity");
    await rejects(() => createActivityForTenant(repA, { typeId: activityType, leadId: leadB }), "ACTIVITY_RECORD_NOT_ACCESSIBLE", "Own user can't link to another rep's lead");
    await rejects(() => createActivityForTenant(repA, { typeId: activityType, opportunityId: oppB }), "ACTIVITY_RECORD_NOT_ACCESSIBLE", "Own user can't link to another rep's opportunity");
    await rejects(() => createActivityForTenant(manager, { typeId: activityType, leadId: leadB }), "ACTIVITY_RECORD_NOT_ACCESSIBLE", "Team user can't link to another team's lead");
    const created = await createActivityForTenant(repA, { typeId: activityType, leadId: leadShared, notes: "Scopesmoke created" });
    check(created?.leadId === leadShared, "Own user can log an activity on a lead shared with them");
    const adminUnlinked = await createActivityForTenant(admin, { typeId: activityType, notes: "Scopesmoke admin unlinked" });
    check(adminUnlinked?.id && !adminUnlinked.leadId, "All-records user can still create an unlinked activity");

    await rejects(() => updateActivityForTenant(repA, actB, { notes: "hijack" }), "ACTIVITY_NOT_FOUND", "an out-of-scope activity is not found on update");
    await rejects(() => updateActivityForTenant(repA, actUnlinked, { notes: "hijack" }), "ACTIVITY_NOT_FOUND", "an unlinked activity is not found for an Own user");
    await rejects(() => updateActivityForTenant(repA, actA, { leadId: leadB }), "ACTIVITY_RECORD_NOT_ACCESSIBLE", "can't move an own activity onto another rep's lead");
    await rejects(() => updateActivityForTenant(repA, actA, { leadId: null }), "ACTIVITY_LINK_REQUIRED", "can't unlink an own activity");
    const edited = await updateActivityForTenant(repA, actA, { notes: "Scopesmoke edited" });
    check(edited?.notes === "Scopesmoke edited", "can edit an own activity");
    const untouched = (await q(`select notes from "Activity" where id = $1`, [actB])).rows[0];
    check(untouched.notes === "Scopesmoke call B", "the refused update changed nothing");

    // --- Global search.
    const search = (u: any) => searchTenantData(u, "Scopesmoke");
    const ids = (rows: any[]) => new Set(rows.map((row) => row.id));
    const adminResults = await search(admin);
    check(adminResults.leads.length === 4, "admin search: all four live leads, merged lead left out");
    check(adminResults.partners.length === 1, "admin search: partners included");
    const repResults = await search(repA);
    check(same(ids(repResults.leads), [leadA, leadShared]), "Own search: own and shared leads only");
    check(repResults.opportunities.length === 0, "Own search: no other rep's opportunity");
    check(repResults.activities.every((row: any) => [actA, actShared, created.id].includes(row.id)) && repResults.activities.length === 3, "Own search: only visible activities");
    check(repResults.tasks.length === 1 && repResults.tasks[0].title === "Scopesmoke task A", "Own search: own tasks only");
    check(repResults.partners.length === 0, "non-admin search: no partners");
    const managerResults = await search(manager);
    check(same(ids(managerResults.leads), [leadA, leadA2]), "Team search: the team's leads only");
    check((await search(partner)).leads.length === 0, "partner search: no leads it doesn't own");
    await q(`update "Lead" set phone = '+91 98765 43210' where id = $1`, [leadB]);
    const byPhone = await searchTenantData(admin, "9876543210");
    check(byPhone.leads.length === 1 && byPhone.leads[0].id === leadB && byPhone.leads[0].phone === "+91 98765 43210", "search matches a lead by phone digits, ignoring spaces and +");
    check((await searchTenantData(repA, "9876543210")).leads.length === 0, "phone search keeps record access");

    // --- "Select all N matching" ids.
    const leadIds = async (u: any, filters: any = null, cap?: number) => listLeadIdsForTenant(u, filters, cap);
    check(same(new Set((await leadIds(repA)).ids), [leadA, leadShared]), "lead ids: Own user gets only visible leads");
    const nameFilter = { logic: "AND", conditions: [{ field: "name", operator: "contains", value: "Bala" }] };
    check(same(new Set((await leadIds(admin, nameFilter)).ids), [leadB]), "lead ids: the list's filters apply");
    const capped = await leadIds(admin, null, 2);
    check(capped.truncated && capped.ids.length === 2, "lead ids: more than the cap is reported, not silently cut");
    check(!(await leadIds(admin)).truncated, "lead ids: under the cap is complete");
    check((await listOpportunityIdsForTenant(repA, null, null)).ids.length === 0 && same(new Set((await listOpportunityIdsForTenant(repB, null, null)).ids), [oppB]), "opportunity ids follow record access");
    check(same(new Set((await listActivityIdsForTenant(repA, null)).ids), [actA, actShared, created.id]), "activity ids follow record access");
    check(same(new Set((await listActivityIdsForTenant(admin, leadFilter as any)).ids), [actB]), "activity ids follow a single filter object");

    console.log(`activity-scope-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId" = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
