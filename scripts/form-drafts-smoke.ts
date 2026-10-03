/**
 * Local-only real-database check for the form editor's save model (decision 29):
 *   - an editor-created form starts unpublished and off, and can't be turned on until published;
 *   - saving a draft doesn't change the public form; publishing does, as the next version, and
 *     needs at least one field;
 *   - placements saved while a draft is open are kept when it's published;
 *   - a draft identical to what's published is cleared; discard drops unpublished changes;
 *   - versions are listed newest first and can be restored as the draft;
 *   - another workspace can't publish or read any of it;
 *   - the submissions export contains every submission (it used to stop at the newest 100).
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/form-drafts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  createFormForTenant,
  discardFormDraftForTenant,
  getFormForTenant,
  getPublicForm,
  listFormVersionsForTenant,
  publishFormForTenant,
  restoreFormVersionAsDraftForTenant,
  saveFormDraftForTenant,
  updateFormForTenant,
  exportFormSubmissionsForTenant,
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
    const setUp = async (id: string) => {
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Form drafts smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `formdrafts.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      for (const [name, label] of [["lead", "Lead"], ["opportunity", "Opportunity"]]) {
        await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $4, now())`, [randomUUID(), id, name, label]);
      }
      return { id: userId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const user = await setUp(tenantId);
    const outsider = await setUp(otherTenantId);
    const field = (label: string) => ({ id: `f_${label}`, label, type: "TEXT", mapping: "name", required: true });

    const form: any = await createFormForTenant(user, { name: "Drafted form", asDraft: true });
    check(form.publishedVersion === 0 && form.isActive === false, "an editor-created form starts unpublished and off");
    await rejects(() => updateFormForTenant(user, form.id, { isActive: true }), "FORM_NOT_PUBLISHED", "it can't be turned on before it's published");
    await rejects(() => publishFormForTenant(user, form.id), "FORM_HAS_NO_FIELDS", "publishing needs at least one field");

    await saveFormDraftForTenant(user, form.id, { fields: [field("Name")], config: { submitButtonText: "Send", placements: ["LEAD_DETAIL"], isActive: true } });
    const draftState: any = await getFormForTenant(user, form.id);
    check(draftState.fields.length === 0 && draftState.draft.fields.length === 1, "a saved draft doesn't change the published form");
    check(!("placements" in draftState.draft.config) && !("isActive" in draftState.draft.config), "placements and on/off are never drafted");
    await rejects(() => publishFormForTenant(outsider, form.id), "FORM_NOT_FOUND", "another workspace can't publish it");

    // A placement saved directly while the draft is open survives publishing.
    await updateFormForTenant(user, form.id, { config: { placements: ["OPPORTUNITY_DETAIL"] } });
    const v1 = await publishFormForTenant(user, form.id, "First");
    check(v1.publishedVersion === 1 && v1.fields.length === 1 && v1.submitButtonText === "Send" && v1.draft === null, "publishing makes the draft the public form as version 1");
    check(JSON.stringify(v1.config.placements) === JSON.stringify(["OPPORTUNITY_DETAIL"]), "a placement saved meanwhile is kept");
    await updateFormForTenant(user, form.id, { isActive: true });
    check(((await getPublicForm(form.id)) as any)?.config?.fields?.length === 1, "once published and on, the public form shows it");

    await saveFormDraftForTenant(user, form.id, { fields: [field("Name"), field("Email")], config: { submitButtonText: "Send" } });
    check(((await getPublicForm(form.id)) as any).config.fields.length === 1, "editing again leaves the public form as published");
    const same: any = await saveFormDraftForTenant(user, form.id, { fields: [field("Name")], config: { submitButtonText: "Send" } });
    check(same.draft === null, "a draft identical to what's published is cleared");
    await rejects(() => publishFormForTenant(user, form.id), "FORM_NOTHING_TO_PUBLISH", "with no changes there's nothing to publish");
    await saveFormDraftForTenant(user, form.id, { fields: [field("Other")], config: {} });
    const discarded: any = await discardFormDraftForTenant(user, form.id);
    check(discarded.draft === null && discarded.fields[0].label === "Name", "discarding drops unpublished changes");

    await saveFormDraftForTenant(user, form.id, { fields: [field("Name"), field("Email")], config: { submitButtonText: "Go" } });
    const v2: any = await publishFormForTenant(user, form.id, null);
    check(v2.publishedVersion === 2 && v2.fields.length === 2, "publishing again makes version 2 public");
    const versions = await listFormVersionsForTenant(user, form.id);
    check(versions.map((row: any) => row.version).join() === "2,1" && versions[1].notes === "First" && versions[0].fieldCount === 2, "versions are listed newest first, with notes and field counts");
    check((await listFormVersionsForTenant(outsider, form.id)).length === 0, "another workspace sees none of its versions");
    const restored: any = await restoreFormVersionAsDraftForTenant(user, form.id, 1);
    check(restored.draft.fields.length === 1 && restored.fields.length === 2, "restoring version 1 loads it as the draft without changing the public form");
    await rejects(() => restoreFormVersionAsDraftForTenant(user, form.id, 9), "FORM_VERSION_NOT_FOUND", "an unknown version can't be restored");

    const apiForm: any = await createFormForTenant(user, { name: "API form" });
    check(apiForm.publishedVersion === 1 && apiForm.isActive === true, "a form created outside the editor is published as before");

    await q(`insert into "FormSubmission" (id, "tenantId", "formId", data) select gen_random_uuid()::text, $1, $2, '{}' from generate_series(1, 250)`, [tenantId, form.id]);
    const csv = await exportFormSubmissionsForTenant(user, form.id);
    check(csv.split("\n").length === 251, "the submissions export has every submission (250 plus the header)");

    console.log(`form-drafts-smoke: ${checks} checks passed`);
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
