/**
 * Local-only real-database check for the automation builder's save model (decision 29):
 *   - a builder-created automation starts as an unpublished draft, can't be turned on, and never
 *     runs;
 *   - autosaving a draft never changes what runs; publishing does, as the next version, after
 *     validation (a name and a trigger are required);
 *   - a draft identical to what's live is cleared; discarding drops unpublished changes;
 *   - versions are listed newest first and any one can be restored as the draft;
 *   - automations created outside the builder (journeys, the API) are live as version 1, and a
 *     direct change to them is still recorded as a version;
 *   - another workspace can't read or change any of it.
 * Temporary tenants, removed afterwards.
 * Run: tsx scripts/automation-drafts-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
  createAutomationForTenant,
  discardAutomationDraftForTenant,
  getAutomationForTenant,
  listAutomationVersionsForTenant,
  publishAutomationForTenant,
  restoreAutomationVersionAsDraftForTenant,
  runAutomationsForEvent,
  saveAutomationDraftForTenant,
  updateAutomationForTenant,
} from "../src/lib/repositories/automations-postgres";

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
      await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Drafts smoke', now())`, [id]);
      const roleId = randomUUID();
      await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Admin', '{"recordAccess":"ALL"}', now())`, [roleId, id]);
      const userId = randomUUID();
      await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke', 'x', $4, now())`, [userId, id, `drafts.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
      return { id: userId, tenantId: id, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    };
    const user = await setUp(tenantId);
    const outsider = await setUp(otherTenantId);
    const executions = async (id: string) => Number((await q(`select count(*)::int n from "AutomationExecution" where "automationId" = $1`, [id])).rows[0].n);
    const fire = async () => { const leadId = randomUUID(); await runAutomationsForEvent(user, "LEAD_CREATED", "LEAD", leadId, { id: leadId, status: "NEW" }).catch(() => undefined); };
    const workflowWith = (labels: string[]) => ({ nodes: labels.map((label, index) => ({ id: `n${index}`, type: "expressive", data: { type: "notify_user", label } })), edges: [] });

    // Builder-created: a draft.
    const created = await createAutomationForTenant(user, { asDraft: true, name: "Draft one", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith([]) });
    check(created.publishedVersion === 0 && created.isActive === false && created.draft, "a builder-created automation starts as an unpublished, off draft");
    await rejects(() => updateAutomationForTenant(user, created.id, { isActive: true }), "AUTOMATION_NOT_PUBLISHED", "an unpublished automation can't be turned on");
    await q(`update "AutomationV2" set "isActive" = true where id = $1`, [created.id]);
    await fire();
    check((await executions(created.id)) === 0, "an unpublished automation never runs, even if switched on behind the builder's back");
    await q(`update "AutomationV2" set "isActive" = false where id = $1`, [created.id]);

    await saveAutomationDraftForTenant(user, created.id, { name: "  ", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith([]) });
    await rejects(() => publishAutomationForTenant(user, created.id), "AUTOMATION_NAME_REQUIRED", "publishing needs a name");
    await saveAutomationDraftForTenant(user, created.id, { name: "Welcome", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith(["Step A"]) });
    const v1 = await publishAutomationForTenant(user, created.id, "First version");
    check(v1.publishedVersion === 1 && v1.name === "Welcome" && v1.draft === null, "publishing makes the draft live as version 1");
    await updateAutomationForTenant(user, created.id, { isActive: true });
    await fire();
    check((await executions(created.id)) === 1, "once published and on, it runs");

    // Autosave never changes what runs.
    await saveAutomationDraftForTenant(user, created.id, { name: "Welcome", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith(["Step A", "Step B"]) });
    const afterDraft = await getAutomationForTenant(user, created.id);
    check((afterDraft.workflow.nodes as any[]).length === 1 && (afterDraft.draft.workflow.nodes as any[]).length === 2, "saving a draft leaves the live workflow unchanged");
    await rejects(() => publishAutomationForTenant(outsider, created.id), "AUTOMATION_NOT_FOUND", "another workspace can't publish it");
    await rejects(() => saveAutomationDraftForTenant(outsider, created.id, { name: "Hijack" }), "AUTOMATION_NOT_FOUND", "another workspace can't save a draft of it");
    check((await listAutomationVersionsForTenant(outsider, created.id)).length === 0, "another workspace sees none of its versions");
    const v2 = await publishAutomationForTenant(user, created.id, null);
    check(v2.publishedVersion === 2 && (v2.workflow.nodes as any[]).length === 2, "publishing again makes version 2 live");
    await rejects(() => publishAutomationForTenant(user, created.id), "AUTOMATION_NOTHING_TO_PUBLISH", "with no changes there's nothing to publish");

    // A draft equal to what's live is cleared; discard drops changes.
    const same = await saveAutomationDraftForTenant(user, created.id, { name: "Welcome", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith(["Step A", "Step B"]) });
    check(same.draft === null, "a draft identical to what's live is cleared");
    await saveAutomationDraftForTenant(user, created.id, { name: "Welcome (edited)", trigger: { type: "LEAD_CREATED" }, workflow: workflowWith([]) });
    const discarded = await discardAutomationDraftForTenant(user, created.id);
    check(discarded.draft === null && discarded.name === "Welcome", "discarding drops unpublished changes");

    // Versions and restore-as-draft.
    const versions = await listAutomationVersionsForTenant(user, created.id);
    check(versions.map((row: any) => row.version).join() === "2,1" && versions[1].notes === "First version" && versions[0].stepCount === 2, "versions are listed newest first, with notes and step counts");
    const restored = await restoreAutomationVersionAsDraftForTenant(user, created.id, 1);
    check((restored.draft.workflow.nodes as any[]).length === 1 && (restored.workflow.nodes as any[]).length === 2, "restoring version 1 loads it as the draft without changing what runs");
    const v3 = await publishAutomationForTenant(user, created.id, "Back to v1");
    check(v3.publishedVersion === 3 && (v3.workflow.nodes as any[]).length === 1, "publishing the restored draft makes it version 3");
    await rejects(() => restoreAutomationVersionAsDraftForTenant(user, created.id, 99), "AUTOMATION_VERSION_NOT_FOUND", "an unknown version can't be restored");

    // Created outside the builder: live as version 1; direct edits are versioned.
    const programmatic = await createAutomationForTenant(user, { name: "From the API", trigger: { type: "MANUAL" }, workflow: workflowWith([]) });
    check(programmatic.publishedVersion === 1 && programmatic.isActive === true && (await listAutomationVersionsForTenant(user, programmatic.id)).length === 1, "an automation created outside the builder is live as version 1");
    const edited = await updateAutomationForTenant(user, programmatic.id, { workflow: workflowWith(["Direct"]) });
    check(edited.publishedVersion === 2 && (await listAutomationVersionsForTenant(user, programmatic.id))[0].notes === "Changed outside the builder", "a direct change to what runs is recorded as a version");
    const toggled = await updateAutomationForTenant(user, programmatic.id, { isActive: false });
    check(toggled.publishedVersion === 2, "turning it on or off isn't a new version");

    console.log(`automation-drafts-smoke: ${checks} checks passed`);
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
