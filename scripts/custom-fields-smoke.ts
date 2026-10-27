/**
 * Local-only real-database check for custom fields on leads and opportunities (2026-10-27):
 *   - values are saved on create and update, returned with labels on read and in lists;
 *   - an opportunity type's own fields apply only to that type;
 *   - a field a permission template hides is left out of reads and can't be written;
 *   - lists filter on custom fields (equals, greater than, is empty);
 *   - the record form's metadata includes the custom fields;
 *   - imports fill them (new and updated records), exports add them as columns;
 *   - website forms save answers mapped to them; the v1 API schema accepts them;
 *   - merging two leads carries over values the survivor didn't have, and unmerge moves them back.
 * A temporary tenant, removed afterwards.
 * Run: tsx scripts/custom-fields-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createLeadForTenant, getLeadForTenant, listLeadsForTenant, updateLeadForTenant } from "../src/lib/repositories/leads-postgres";
import { createOpportunityForTenant, getOpportunityForTenant, listOpportunitiesForTenantByType } from "../src/lib/repositories/opportunities-postgres";
import { createCustomFieldForTenant } from "../src/lib/server/admin-modules";
import { getObjectMetadataForTenant } from "../src/lib/server/metadata";
import { processImportJob } from "../src/lib/server/crm";
import { fetchExportRows } from "../src/lib/server/exports";
import { submitPublicForm } from "../src/lib/repositories/forms-postgres";
import { apiLeadCreate } from "../src/lib/server/create-records";
import { mergeRecordsForTenant, unmergeForTenant } from "../src/lib/repositories/dedupe-postgres";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Custom fields smoke', now())`, [tenantId]);
    await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { opportunityEnabled: true, formBuilderEnabled: true }]);
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [roleId, tenantId, { recordAccess: "ALL" }]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, now())`, [userId, tenantId, `cf.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, role: { permissions: { recordAccess: "ALL" } } } as any;
    const objectIds: Record<string, string> = {};
    for (const name of ["lead", "opportunity", "activity"]) {
      objectIds[name] = randomUUID();
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [objectIds[name], tenantId, name]);
    }
    const typeId = randomUUID();
    const otherTypeId = randomUUID();
    for (const [id, name] of [[typeId, "Admission"], [otherTypeId, "Scholarship"]]) {
      await q(`insert into "OpportunityType" (id, "tenantId", "objectId", name, "isActive", "updatedAt") values ($1, $2, $3, $4, true, now())`, [id, tenantId, objectIds.opportunity, name]);
      await q(`insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", "updatedAt") values ($1, $2, $3, 'New', 0, now())`, [randomUUID(), tenantId, id]);
    }

    await createCustomFieldForTenant(user, { objectType: "LEAD", key: "course_interest", label: "Course interest", type: "SELECT", options: ["MBA", "BBA"] });
    await createCustomFieldForTenant(user, { objectType: "LEAD", key: "budget", label: "Budget", type: "NUMBER" });
    await createCustomFieldForTenant(user, { objectType: "OPPORTUNITY", key: "intake", label: "Intake", type: "TEXT", entityType: "OPPORTUNITY_TYPE", entityTypeId: typeId });

    // ---- Create, read, update ------------------------------------------------------------------
    const lead: any = await createLeadForTenant(user, { name: "Field lead", email: "field@smoke.invalid", customFields: { course_interest: "MBA", budget: "250000", not_a_field: "x" } });
    equal(lead.customFields, { course_interest: "MBA", budget: 250000 }, "a new lead saves its custom fields, typed, unknown keys ignored");
    equal(lead.customFieldLabels, { course_interest: "Course interest", budget: "Budget" }, "with their labels");
    const formStyle: any = await createLeadForTenant(user, { name: "Form lead", data: { budget: 90000 } });
    equal((await getLeadForTenant(user, formStyle.id))?.customFields, { budget: 90000 }, "the record form's `data` saves too, and a read returns it");
    const updated: any = await updateLeadForTenant(user, lead.id, { customFields: { budget: "", course_interest: "BBA" } });
    equal(updated.customFields, { course_interest: "BBA" }, "an update changes one value and clears another");
    const history = (await q(`select diff from "AuditLog" where "tenantId" = $1 and "entityId" = $2 and action = 'UPDATE' order by "createdAt" desc limit 1`, [tenantId, lead.id])).rows[0]?.diff ?? {};
    check(history["customFields.course_interest"]?.after === "BBA", "the change is in the lead's history");

    // ---- Permission template hides a field -----------------------------------------------------
    const restricted = { ...user, role: { permissions: { recordAccess: "ALL", fieldPermissions: { leads: { course_interest: "hidden" } } } } };
    check(!("course_interest" in ((await getLeadForTenant(restricted, lead.id)) as any).customFields), "a hidden custom field is left out of reads");
    await updateLeadForTenant(restricted, lead.id, { customFields: { course_interest: "MBA" } });
    equal((await getLeadForTenant(user, lead.id) as any).customFields.course_interest, "BBA", "and can't be written by that user");

    // ---- Lists and filters ---------------------------------------------------------------------
    const list = await listLeadsForTenant(user, 1, 50);
    equal((list.data.find((row: any) => row.id === formStyle.id) as any)?.customFields, { budget: 90000 }, "list rows carry their custom fields");
    const filterIds = async (field: string, operator: string, value: unknown) =>
      (await listLeadsForTenant(user, 1, 50, [{ logic: "AND", conditions: [{ field, operator, value }] }] as any, { strictFilters: true })).data.map((row: any) => row.name).sort();
    equal(await filterIds("customFields.course_interest", "equals", "BBA"), ["Field lead"], "filter: dropdown equals");
    equal(await filterIds("customFields.budget", "greater_than", 50000), ["Form lead"], "filter: number greater than");
    equal(await filterIds("customFields.budget", "is_empty", null), ["Field lead"], "filter: is empty matches records with no value");

    // ---- Opportunity type-specific fields ------------------------------------------------------
    const opportunity: any = await createOpportunityForTenant(user, { title: "Admission opp", leadId: lead.id, opportunityTypeId: typeId, customFields: { intake: "Jan 2027" } });
    equal(opportunity.customFields, { intake: "Jan 2027" }, "an opportunity saves its type's own field");
    const other: any = await createOpportunityForTenant(user, { title: "Scholarship opp", leadId: lead.id, opportunityTypeId: otherTypeId, customFields: { intake: "Jan 2027" } });
    equal(other.customFields, {}, "another type's field isn't saved on it");
    equal((await getOpportunityForTenant(user, opportunity.id) as any)?.customFieldLabels, { intake: "Intake" }, "read back with its label");
    check((await listOpportunitiesForTenantByType(user, 50, null, [{ logic: "AND", conditions: [{ field: "customFields.intake", operator: "equals", value: "Jan 2027" }] }] as any)).data.map((row: any) => row.id).join() === opportunity.id, "opportunity lists filter on custom fields");

    // ---- Form metadata -------------------------------------------------------------------------
    const metadata: any = await getObjectMetadataForTenant("lead", tenantId);
    const customKeys = metadata.fields.filter((field: any) => field.isCustom).map((field: any) => `${field.key}:${field.type}`);
    equal(customKeys, ["course_interest:DROPDOWN", "budget:NUMBER"], "the lead form's metadata includes the custom fields, as form input types");

    // ---- Import ------------------------------------------------------------------------------
    const jobId = randomUUID();
    await q(`insert into "ImportJob" (id, "tenantId", "userId", module, "filePath", mapping, status, rows, "updatedAt") values ($1, $2, $3, 'LEAD', 'smoke', $4, 'QUEUED', $5, now())`,
      [jobId, tenantId, userId, { fields: [{ source: "Name", target: "name" }, { source: "Email", target: "email" }, { source: "Course", target: "customFields.course_interest" }], duplicateMode: "UPDATE" },
        JSON.stringify([{ Name: "Imported lead", Email: "imported@smoke.invalid", Course: "MBA" }, { Name: "Field lead", Email: "field@smoke.invalid", Course: "MBA" }])]);
    const job: any = await processImportJob(jobId);
    equal([job?.status, job?.stats?.created, job?.stats?.updated], ["COMPLETED", 1, 1], "the import creates one lead and updates one");
    const imported = (await q(`select id from "Lead" where "tenantId" = $1 and email = 'imported@smoke.invalid'`, [tenantId])).rows[0];
    equal((await getLeadForTenant(user, imported.id) as any).customFields, { course_interest: "MBA" }, "an imported new lead gets its custom field");
    equal((await getLeadForTenant(user, lead.id) as any).customFields.course_interest, "MBA", "an imported update changes the existing lead's custom field");

    // ---- Export --------------------------------------------------------------------------------
    const exported = await fetchExportRows(user, "LEADS" as any);
    const row = exported.find((item: any) => item["Lead Name"] === "Form lead") as any;
    equal([row?.Budget, row?.["Course interest"]], [90000, null], "an export adds custom fields as labelled columns");
    check(!("__id" in row), "without the internal id column");

    // ---- Website form --------------------------------------------------------------------------
    const formId = randomUUID();
    const leadObject = (await q(`select id from "ObjectDefinition" where "tenantId" = $1 and name = 'lead'`, [tenantId])).rows[0].id;
    await q(`insert into "Form" (id, "tenantId", "objectId", name, fields, "isActive", "spamProtection", "updatedAt") values ($1, $2, $3, 'Smoke form', '[]', true, false, now())`, [formId, tenantId, leadObject]);
    await submitPublicForm(formId, { name: "Form submitter", email: "submitter@smoke.invalid", "lead.course_interest": "BBA", "lead.budget": "not a number" });
    const submitted = (await q(`select id from "Lead" where "tenantId" = $1 and email = 'submitter@smoke.invalid'`, [tenantId])).rows[0];
    equal((await getLeadForTenant(user, submitted.id) as any).customFields, { course_interest: "BBA" }, "a website form saves mapped custom fields and skips a value of the wrong kind");

    // ---- API v1 schema -------------------------------------------------------------------------
    check(apiLeadCreate.safeParse({ name: "Api lead", customFields: { budget: 100, course_interest: "MBA" } }).success, "the v1 API accepts customFields");
    check(!apiLeadCreate.safeParse({ name: "Api lead", customFields: { budget: { nested: true } } }).success, "and refuses a value that isn't text, number, yes/no or a list");

    // ---- Merge and unmerge ---------------------------------------------------------------------
    const survivor: any = await createLeadForTenant(user, { name: "Survivor", customFields: { course_interest: "MBA" } });
    const loser: any = await createLeadForTenant(user, { name: "Loser", customFields: { course_interest: "BBA", budget: 120000 } });
    const matchId = randomUUID();
    await q(`insert into "DedupeMatch" (id, "tenantId", "entityType", "recordIds", "matchedRuleType", status) values ($1, $2, 'LEAD', $3, 'EMAIL', 'PENDING')`, [matchId, tenantId, [survivor.id, loser.id]]);
    const merged: any = await mergeRecordsForTenant(user, { matchId, survivorId: survivor.id });
    equal((await getLeadForTenant(user, survivor.id) as any).customFields, { course_interest: "MBA", budget: 120000 }, "merging keeps the survivor's values and carries over the ones it didn't have");
    await unmergeForTenant(user, merged.mergeAuditId);
    const loserValues = (await q(`select fd.key from "CustomFieldValue" v join "FieldDefinition" fd on fd.id = v."fieldDefinitionId" where v."recordId" = $1 order by fd.key`, [loser.id])).rows.map((r) => r.key);
    equal(loserValues, ["budget", "course_interest"], "unmerging moves them back");

    console.log(`Custom fields smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
