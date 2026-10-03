/**
 * Local-only real-database check for the archive model (decision 31) on automations and forms:
 *   - Delete archives: the item leaves the list, appears under Archived, and stops working at
 *     once (an archived automation no longer runs on events or test runs and can't be edited; an
 *     archived form's public link and submissions stop);
 *   - Restore brings it back as it was (on/off, submissions kept);
 *   - an automation that runs a journey can't be archived;
 *   - permanent delete only works on an archived item;
 *   - the purge removes items archived more than 30 days ago and keeps newer ones;
 *   - another workspace can't archive, restore or see them.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/archive-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  archiveAutomationForTenant,
  deleteAutomationForTenant,
  listAutomationsForTenant,
  purgeArchivedAutomations,
  restoreAutomationForTenant,
  runAutomationsForEvent,
  testAutomationForTenant,
  updateAutomationForTenant,
} from "../src/lib/repositories/automations-postgres";
import {
  archiveFormForTenant,
  createFormForTenant,
  deleteFormForTenant,
  getPublicForm,
  listFormsForTenant,
  purgeArchivedForms,
  restoreFormForTenant,
  submitPublicForm,
  updateFormForTenant,
} from "../src/lib/repositories/forms-postgres";

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
    const setUp = async (id: string, name: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, $2, now())`, [id, name]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `archive.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      for (const [objectName, label] of [["lead", "Lead"], ["opportunity", "Opportunity"]]) {
        await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $4, now())`, [randomUUID(), id, objectName, label]);
      }
      return { id: userId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const user = await setUp(tenantId, "Archive smoke");
    const outsider = await setUp(otherTenantId, "Archive smoke (other)");
    const automation = async (name: string, isActive = true) => {
      const id = randomUUID();
      await q(`insert into "AutomationV2" (id, "tenantId", name, trigger, workflow, "isActive", "publishedVersion", "updatedAt") values ($1, $2, $3, $4, $5, $6, 1, now())`,
        [id, tenantId, name, { type: "LEAD_CREATED" }, { nodes: [], edges: [] }, isActive]);
      return id;
    };
    const executions = async (id: string) => Number((await q(`select count(*)::int n from "AutomationExecution" where "automationId" = $1`, [id])).rows[0].n);
    const listed = async (archived = false) => (await listAutomationsForTenant(user, { archived })).map((row: any) => row.id);

    // --- Automations ---
    const archivedOne = await automation("Archive me");
    const control = await automation("Keep me");
    const result = await archiveAutomationForTenant(user, archivedOne);
    const days = (new Date(result.purgeAfter).getTime() - new Date(result.deletedAt).getTime()) / 86_400_000;
    check(Math.round(days) === 30, "archiving says when it will be purged (30 days)");
    check(!(await listed()).includes(archivedOne) && (await listed(true)).includes(archivedOne), "an archived automation leaves the list and appears under Archived");

    const leadId = randomUUID();
    await runAutomationsForEvent(user, "LEAD_CREATED", "LEAD", leadId, { id: leadId, name: "Smoke lead", status: "NEW" }).catch(() => undefined);
    check((await executions(control)) >= 1 && (await executions(archivedOne)) === 0, "an archived automation no longer runs on events (the one beside it does)");
    await rejects(() => updateAutomationForTenant(user, archivedOne, { name: "Edited" }), "AUTOMATION_ARCHIVED", "an archived automation can't be edited");
    await rejects(() => testAutomationForTenant(user, archivedOne, { entityType: "LEAD", entityId: leadId }), "AUTOMATION_ARCHIVED", "an archived automation can't be test-run");
    await rejects(() => archiveAutomationForTenant(outsider, control), "AUTOMATION_NOT_FOUND", "another workspace can't archive it");
    await rejects(() => restoreAutomationForTenant(outsider, archivedOne), "AUTOMATION_NOT_FOUND", "another workspace can't restore it");
    check(!(await listAutomationsForTenant(outsider, { archived: true })).some((row: any) => row.id === archivedOne), "another workspace doesn't see it under Archived");

    const offOne = await automation("Off one", false);
    await archiveAutomationForTenant(user, offOne);
    const restored = await restoreAutomationForTenant(user, offOne);
    check(restored.isActive === false && (await listed()).includes(offOne), "restoring brings it back as it was (still off)");
    await restoreAutomationForTenant(user, archivedOne);
    check((await listed()).includes(archivedOne), "restore is the Undo");

    const journeyAutomation = await automation("[Journey] Smoke");
    await q(`insert into "MarketingJourney" (id, "tenantId", "automationId", name, "targetModule", status, "updatedAt") values ($1, $2, $3, 'Smoke journey', 'LEAD', 'ACTIVE', now())`, [randomUUID(), tenantId, journeyAutomation]);
    await rejects(() => archiveAutomationForTenant(user, journeyAutomation), "AUTOMATION_USED_BY_JOURNEY", "an automation that runs a journey can't be archived");

    await rejects(() => deleteAutomationForTenant(user, control), "AUTOMATION_NOT_ARCHIVED", "permanent delete needs the automation archived first");
    await archiveAutomationForTenant(user, control);
    await deleteAutomationForTenant(user, control);
    check((await q(`select 1 from "AutomationV2" where id = $1`, [control])).rowCount === 0 && (await executions(control)) === 0, "permanent delete removes it and its run history");

    const old = await automation("Archived long ago");
    const recent = await automation("Archived recently");
    await q(`update "AutomationV2" set "deletedAt" = now() - interval '31 days' where id = $1`, [old]);
    await q(`update "AutomationV2" set "deletedAt" = now() - interval '29 days' where id = $1`, [recent]);
    await q(`update "AutomationV2" set "deletedAt" = now() - interval '31 days' where id = $1`, [journeyAutomation]);
    await purgeArchivedAutomations();
    const remaining = (await q(`select id from "AutomationV2" where id = any($1)`, [[old, recent, journeyAutomation]])).rows.map((row) => row.id);
    check(!remaining.includes(old) && remaining.includes(recent), "the purge removes automations archived over 30 days ago and keeps newer ones");
    check(remaining.includes(journeyAutomation), "the purge never removes an automation a journey still uses");

    // --- Forms ---
    const form = await createFormForTenant(user, { name: "Archive smoke form", isActive: true }) as any;
    await q(`insert into "FormSubmission" (id, "tenantId", "formId", data) values ($1, $2, $3, '{}')`, [randomUUID(), tenantId, form.id]);
    check(!!(await getPublicForm(form.id)), "a live form's public link works");
    await archiveFormForTenant(user, form.id);
    check((await getPublicForm(form.id)) === null, "an archived form's public link stops working");
    await rejects(() => submitPublicForm(form.id, { name: "Someone" }), "FORM_NOT_FOUND", "an archived form refuses public submissions");
    check(!(await listFormsForTenant(user)).some((row: any) => row.id === form.id) && (await listFormsForTenant(user, { archived: true })).some((row: any) => row.id === form.id), "an archived form leaves the list and appears under Archived");
    await rejects(() => updateFormForTenant(user, form.id, { name: "Edited" }), "FORM_ARCHIVED", "an archived form can't be edited");
    await rejects(() => restoreFormForTenant(outsider, form.id), "FORM_NOT_FOUND", "another workspace can't restore it");
    await restoreFormForTenant(user, form.id);
    const submissions = Number((await q(`select count(*)::int n from "FormSubmission" where "formId" = $1`, [form.id])).rows[0].n);
    check(!!(await getPublicForm(form.id)) && submissions === 1, "restoring brings back the public link, with its submissions");

    await rejects(() => deleteFormForTenant(user, form.id), "FORM_NOT_ARCHIVED", "permanent delete needs the form archived first");
    const oldForm = await createFormForTenant(user, { name: "Old archived form", isActive: true }) as any;
    await q(`insert into "FormSubmission" (id, "tenantId", "formId", data) values ($1, $2, $3, '{}')`, [randomUUID(), tenantId, oldForm.id]);
    await q(`update "Form" set "deletedAt" = now() - interval '31 days' where id = $1`, [oldForm.id]);
    await archiveFormForTenant(user, form.id);
    await purgeArchivedForms();
    check((await q(`select 1 from "Form" where id = $1`, [oldForm.id])).rowCount === 0 && (await q(`select 1 from "FormSubmission" where "formId" = $1`, [oldForm.id])).rowCount === 0, "the purge removes forms archived over 30 days ago, with their submissions");
    check((await q(`select 1 from "Form" where id = $1`, [form.id])).rowCount === 1, "a form archived today is kept");

    console.log(`archive-smoke: ${checks} checks passed`);
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
