/**
 * Local-only real-database check of the opportunity bulk delete (Section 8 #5: the list sent one
 * DELETE per record):
 *   - one call deletes the opportunities this person can see; ids that are gone or belong to
 *     someone else (for "own records" access) come back as "Not found" and stay untouched;
 *   - an opportunity still linked to a task can't be deleted: the others in the batch still are,
 *     and that one is reported with its reason (a single delete of it fails with the foreign-key
 *     code, which the route turns into a 409 instead of a 500);
 *   - more than 1,000 ids at once is refused.
 * Temporary tenant, removed afterwards.
 * Run: tsx scripts/opportunity-bulk-delete-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { listStagesForType } from "../src/lib/repositories/stages-postgres";
import { createOpportunityTypeConfigForTenant } from "../src/lib/server/admin-modules";
import { deleteOpportunitiesForTenant, deleteOpportunityForTenant } from "../src/lib/repositories/opportunities-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const tenantId = randomUUID();
  const exists = async (id: string) => (await q(`select 1 from "Opportunity" where id = $1`, [id])).rowCount === 1;
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Opportunity bulk delete smoke', now())`, [tenantId]);
    const person = async (recordAccess: "ALL" | "OWN") => {
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, $3, $4, now())`, [roleId, tenantId, `Smoke ${recordAccess}`, { recordAccess }]);
      const id = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [id, tenantId, `bulk.${id.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id, tenantId, isTenantAdmin: recordAccess === "ALL", role: { permissions: { recordAccess } } } as any;
    };
    const admin = await person("ALL");
    const rep = await person("OWN");
    for (const [name, label] of [["lead", "Lead"], ["opportunity", "Opportunity"]]) {
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $4, now())`, [randomUUID(), tenantId, name, label]);
    }
    const objectId = (name: string) => q(`select id from "ObjectDefinition" where "tenantId" = $1 and name = $2`, [tenantId, name]).then((r) => r.rows[0].id as string);
    const type = await createOpportunityTypeConfigForTenant(admin, { name: "Smoke type" });
    const stageId = (await listStagesForType(admin, type.id))[0].id;
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, "createdBy", "updatedAt", tags) values ($1, $2, $3, 'Bulk smoke lead', $4, now(), '{}')`, [leadId, tenantId, await objectId("lead"), admin.id]);
    const opportunityObjectId = await objectId("opportunity");
    const opportunity = async (title: string, ownerId: string) => {
      const id = randomUUID();
      await q(`insert into "Opportunity" (id, "tenantId", "objectId", "leadId", "opportunityTypeId", "stageId", title, "ownerId", "createdBy", "updatedAt", tags) values ($1, $2, $3, $4, $5, $6, $7, $8, $8, now(), '{}')`, [id, tenantId, opportunityObjectId, leadId, type.id, stageId, title, ownerId]);
      return id;
    };
    const repsA = await opportunity("Rep A", rep.id);
    const repsB = await opportunity("Rep B", rep.id);
    const adminsC = await opportunity("Admin C", admin.id);
    const withTask = await opportunity("Has a task", rep.id);
    const adminsE = await opportunity("Admin E", admin.id);
    await q(`insert into "Task" (id, "tenantId", title, "ownerId", "createdBy", "opportunityId", "updatedAt") values ($1, $2, 'Linked task', $3, $3, $4, now())`, [randomUUID(), tenantId, admin.id, withTask]);

    const missing = randomUUID();
    const byRep = await deleteOpportunitiesForTenant(rep, [repsA, adminsC, missing, repsA]);
    check(byRep.deleted === 1 && !(await exists(repsA)), "a rep's bulk delete removes their own opportunity");
    check(byRep.failed.length === 2 && byRep.failed.every((failure) => failure.reason === "Not found") && byRep.failed.some((failure) => failure.id === adminsC) && byRep.failed.some((failure) => failure.id === missing), "someone else's and a missing id come back as Not found (duplicates counted once)");
    check(await exists(adminsC), "and someone else's opportunity is untouched");

    const byAdmin = await deleteOpportunitiesForTenant(admin, [repsB, withTask, adminsE]);
    check(byAdmin.deleted === 2 && !(await exists(repsB)) && !(await exists(adminsE)), "an opportunity that can't be deleted doesn't stop the rest of the batch");
    check(byAdmin.failed.length === 1 && byAdmin.failed[0].id === withTask && /tasks/.test(byAdmin.failed[0].reason) && (await exists(withTask)), "the blocked one is reported with its reason and kept");

    await assert.rejects(() => deleteOpportunityForTenant(admin, withTask), (error: any) => error?.code === "23503", "a single delete of it fails with the foreign-key code (409 from the route)");
    checks++;

    await assert.rejects(() => deleteOpportunitiesForTenant(admin, Array.from({ length: 1001 }, () => randomUUID())), (error: any) => error?.message === "BULK_LIMIT_EXCEEDED", "more than 1,000 at once is refused");
    checks++;

    console.log(`opportunity-bulk-delete-smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
