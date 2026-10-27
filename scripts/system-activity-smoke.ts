/**
 * Local-only real-database check for voice bot plan wave A (2026-10-27):
 *   - migration 0141 marks Call as a system type, moves hand-logged calls to "Call (logged
 *     manually)" (dialled calls stay), and renames the old hand-made Email type;
 *   - system activity types can't be picked by hand, renamed, switched off or deleted;
 *   - on a system activity only notes, completion and custom fields can change;
 *   - custom field values are saved and read back for activities (typed per field);
 *   - an email sent to a lead becomes a locked Email activity that follows delivery events;
 *   - automations refuse unknown steps, and a step can't create a system-type activity;
 *   - the AI assistant's API key is stored encrypted.
 * A temporary tenant, removed afterwards.
 * Run: tsx scripts/system-activity-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createActivityForTenant, updateActivityForTenant, updateActivityTypeForTenant, deleteActivityTypeForTenant, ensureSystemActivityType, listActivityTypesForTenant } from "../src/lib/server/crm";
import { createCustomFieldForTenant } from "../src/lib/server/admin-modules";
import { queueCommunicationForTenant, recordProviderWebhookEvent } from "../src/lib/server/communications";
import { createAutomationForTenant } from "../src/lib/repositories/automations-postgres";
import { upsertAiProviderSettingsForTenant } from "../src/lib/server/ai-assistant";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
  for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
  const pool = getPool();
  const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
  let checks = 0;
  const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
  const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const rejects = async (run: () => Promise<unknown>, code: string, label: string) => {
    await assert.rejects(run, (error: any) => error?.message === code, `${label} (expected ${code})`);
    checks++;
  };
  const tenantId = randomUUID();
  try {
    await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'System activity smoke', now())`, [tenantId]);
    for (const key of ["TELEPHONY", "AI_COPILOT"]) {
      await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, $3, 'ENABLED')`, [randomUUID(), tenantId, key]);
    }
    const roleId = randomUUID();
    await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [roleId, tenantId, { recordAccess: "ALL" }]);
    const userId = randomUUID();
    await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Smoke admin', 'x', $4, now())`,
      [userId, tenantId, `system-activity.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
    const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL" } } } as any;
    const objectId = async (name: string) => {
      const id = randomUUID();
      await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [id, tenantId, name]);
      return id;
    };
    const leadObject = await objectId("lead");
    const activityObject = await objectId("activity");
    const leadId = randomUUID();
    await q(`insert into "Lead" (id, "tenantId", "objectId", name, email, "ownerId", "updatedAt") values ($1, $2, $3, 'Smoke lead', 'lead@smoke.invalid', $4, now())`, [leadId, tenantId, leadObject, userId]);

    // ---- Migration 0141 on this workspace's old-style types -----------------------------------
    const oldType = async (name: string) => {
      const id = randomUUID();
      await q(`insert into "ActivityType" (id, "tenantId", "objectId", name, "order", "isActive", "updatedAt") values ($1, $2, $3, $4, 0, true, now())`, [id, tenantId, activityObject, name]);
      return id;
    };
    const callType = await oldType("Call");
    const emailType = await oldType("Email");
    const activity = async (typeId: string, notes: string) => {
      const id = randomUUID();
      await q(`insert into "Activity" (id, "tenantId", "objectId", "typeId", "leadId", notes, "createdBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, $7, now())`, [id, tenantId, activityObject, typeId, leadId, notes, userId]);
      return id;
    };
    const handLoggedCall = await activity(callType, "Called from my mobile");
    const dialledCall = await activity(callType, "Dialled through the CRM");
    await q(`insert into "TelephonyCallLog" (id, "tenantId", provider, "callId", "activityId", "leadId") values ($1, $2, 'plivo', $3, $4, $5)`, [randomUUID(), tenantId, randomUUID(), dialledCall, leadId]);
    const handLoggedEmail = await activity(emailType, "Emailed from Gmail");
    // The migration's data steps (its table changes already ran; the app's user can't alter tables).
    const migration = readFileSync("migrations/0141_system_activity_types.sql", "utf8");
    await q(migration.slice(migration.indexOf(`update "ActivityType" set "systemKey" = 'CALL'`)));
    const typeOf = async (activityId: string) => (await q(`select t.name, t."isSystem" from "Activity" a join "ActivityType" t on t.id = a."typeId" where a.id = $1`, [activityId])).rows[0];
    equal(await typeOf(dialledCall), { name: "Call", isSystem: true }, "a dialled call stays under the system Call type");
    equal(await typeOf(handLoggedCall), { name: "Call (logged manually)", isSystem: false }, "a hand-logged call moves to Call (logged manually)");
    equal(await typeOf(handLoggedEmail), { name: "Email (logged manually)", isSystem: false }, "the old Email type becomes Email (logged manually) with its activities");

    // ---- System types can't be picked, renamed or deleted -------------------------------------
    const systemEmail = await ensureSystemActivityType(user, "EMAIL");
    const types = await listActivityTypesForTenant(user);
    check(types.find((type: any) => type.id === systemEmail)?.isSystem, "the system Email type is listed as a system type");
    check(types.some((type: any) => type.name === "WhatsApp" && type.isSystem) && types.some((type: any) => type.name === "SMS" && type.isSystem), "WhatsApp and SMS system types exist");
    await rejects(() => createActivityForTenant(user, { typeId: callType, leadId, notes: "x" }), "ACTIVITY_TYPE_SYSTEM", "a person can't log a system Call activity");
    await rejects(() => updateActivityTypeForTenant(user, callType, { name: "Phone" }), "ACTIVITY_TYPE_SYSTEM", "a system type can't be renamed");
    await rejects(() => updateActivityTypeForTenant(user, callType, { isActive: false }), "ACTIVITY_TYPE_SYSTEM", "a system type can't be switched off");
    await rejects(() => deleteActivityTypeForTenant(user, callType), "ACTIVITY_TYPE_SYSTEM", "a system type can't be deleted");
    equal((await updateActivityTypeForTenant(user, callType, { color: "#000000" })).color, "#000000", "a system type's colour can be changed");

    // ---- A system activity: only notes, completion and custom fields change --------------------
    const systemActivity = await createActivityForTenant(user, { typeId: callType, leadId, outcome: "SUCCESS", notes: "Logged by the CRM" }, { system: true });
    equal((await updateActivityForTenant(user, systemActivity.id, { notes: "Added a note" })).notes, "Added a note", "notes on a system activity can be edited");
    check((await updateActivityForTenant(user, systemActivity.id, { completedAt: new Date().toISOString() })).completedAt, "a system activity can be marked complete");
    await rejects(() => updateActivityForTenant(user, systemActivity.id, { outcome: "NOT_INTERESTED" }), "ACTIVITY_SYSTEM_READ_ONLY", "a system activity's outcome can't be changed");
    await rejects(() => updateActivityForTenant(user, handLoggedCall, { typeId: callType }), "ACTIVITY_TYPE_SYSTEM", "a hand-logged activity can't be turned into a system one");
    equal((await updateActivityForTenant(user, systemActivity.id, { outcome: "SUCCESS", notes: "Same outcome sent back" })).notes, "Same outcome sent back", "an unchanged field sent back with the notes is fine");

    // ---- Custom field values ------------------------------------------------------------------
    const manualCallType = (await q(`select id from "ActivityType" where "tenantId" = $1 and name = 'Call (logged manually)'`, [tenantId])).rows[0].id;
    await createCustomFieldForTenant(user, { objectType: "ACTIVITY", key: "course_interest", label: "Course interest", type: "SELECT", options: ["MBA", "BBA"], entityType: "ACTIVITY_TYPE", entityTypeId: manualCallType });
    await createCustomFieldForTenant(user, { objectType: "ACTIVITY", key: "budget", label: "Budget", type: "NUMBER" });
    const withFields = await createActivityForTenant(user, { typeId: manualCallType, leadId, notes: "Discussed courses", data: { course_interest: "MBA", budget: "250000", unknown_key: "ignored" } });
    equal(withFields.customFields, { course_interest: "MBA", budget: 250000 }, "custom field values are saved and read back, typed, unknown keys ignored");
    equal(withFields.customFieldLabels, { course_interest: "Course interest", budget: "Budget" }, "with their labels");
    const edited = await updateActivityForTenant(user, withFields.id, { customFields: { budget: "", course_interest: "BBA" } });
    equal(edited.customFields, { course_interest: "BBA" }, "an edit changes a value and an empty value removes one");
    await rejects(() => createActivityForTenant(user, { typeId: manualCallType, leadId, data: { budget: "a lot" } }), "CUSTOM_FIELD_VALUE_INVALID", "a value of the wrong kind is refused");
    const systemEdited = await updateActivityForTenant(user, systemActivity.id, { customFields: { budget: 100 } });
    equal(systemEdited.customFields, { budget: 100 }, "custom fields on a system activity can be edited");

    // ---- Sent messages become locked activities -----------------------------------------------
    const outbox = await queueCommunicationForTenant(user, { channel: "EMAIL", recipient: "lead@smoke.invalid", subject: "Your application", body: "Hello from the CRM", entityType: "LEAD", entityId: leadId });
    const messageActivity = (await q(`select a.id, a.outcome, a.notes, t.name, t."isSystem" from "CommunicationOutbox" o join "Activity" a on a.id = o."activityId" join "ActivityType" t on t.id = a."typeId" where o.id = $1`, [outbox.id])).rows[0];
    equal([messageActivity?.name, messageActivity?.isSystem, messageActivity?.outcome], ["Email", true, "QUEUED"], "a queued email to a lead is a locked Email activity");
    check(String(messageActivity.notes).includes("Subject: Your application"), "the activity shows the subject");
    await q(`insert into "CommunicationDeliveryEvent" (id, "tenantId", "outboxId", channel, "eventType", "providerMessageId") values ($1, $2, $3, 'EMAIL', 'SENT', 'provider-msg-1')`, [randomUUID(), tenantId, outbox.id]);
    await recordProviderWebhookEvent({ tenantId, channel: "EMAIL", providerMessageId: "provider-msg-1", eventType: "DELIVERED", payload: {} });
    await recordProviderWebhookEvent({ tenantId, channel: "EMAIL", providerMessageId: "provider-msg-1", eventType: "OPENED", payload: {} });
    await recordProviderWebhookEvent({ tenantId, channel: "EMAIL", providerMessageId: "provider-msg-1", eventType: "BOUNCED", payload: {} });
    equal((await q(`select outcome from "Activity" where id = $1`, [messageActivity.id])).rows[0].outcome, "READ", "provider events move it on, and a late bounce doesn't undo a read");
    await rejects(() => updateActivityForTenant(user, messageActivity.id, { outcome: "SUCCESS" }), "ACTIVITY_SYSTEM_READ_ONLY", "a sent message's outcome can't be edited");

    // ---- Automations ---------------------------------------------------------------------------
    await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3) on conflict do nothing`, [randomUUID(), tenantId, { automationEnabled: true }]);
    await rejects(() => createAutomationForTenant(user, { name: "Bad", workflow: { nodes: [{ id: "a", data: { type: "send_fax" } }], edges: [] } }), "AUTOMATION_STEP_UNSUPPORTED", "an automation with an unknown step can't be saved");
    check((await createAutomationForTenant(user, { name: "Good", isActive: false, workflow: { nodes: [{ id: "a", data: { type: "trigger" } }, { id: "b", data: { type: "add_activity", activityTypeId: manualCallType } }], edges: [] } }))?.id, "an automation with known steps saves");

    // ---- AI key encrypted -----------------------------------------------------------------------
    await upsertAiProviderSettingsForTenant(user, { enabled: true, providerMode: "EXTERNAL_API", endpointUrl: "https://ai.smoke.invalid/v1", secretConfig: { apiKey: "sk-smoke-secret" } });
    const stored = (await q(`select "secretConfig" from "AiProviderSettings" where "tenantId" = $1`, [tenantId])).rows[0].secretConfig;
    check(String(stored.apiKey).startsWith("v1:") && !String(stored.apiKey).includes("sk-smoke"), "the AI API key is stored encrypted");

    console.log(`System activity smoke: ${checks} checks passed`);
  } finally {
    const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
    for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
    await q(`delete from "Tenant" where id = $1`, [tenantId]);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
