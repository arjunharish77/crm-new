/**
 * Local-only real-database check for voice bot plan wave B (2026-10-27):
 *   - a new bot gets its own locked activity type ("Voice bot: <name>", VOICE_BOT), renamed with it;
 *   - names are unique, settings are validated, going live is refused until the bot is ready;
 *   - bot fields are custom fields of that activity type; deleting one drops its mappings and links;
 *   - caller details come from the lead (incl. custom fields) and its opportunity per the bot setting,
 *     and only the ticked ones are returned; previews fill placeholders;
 *   - numbers: who answers each, validation, and archiving a bot hands its numbers back to people;
 *   - holidays; provider keys stored encrypted and never returned;
 *   - Claude spend: counted per month, alerts once per level, the cap is enforced.
 * A temporary tenant, removed afterwards.
 * Run: tsx scripts/voice-bots-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import {
    addVoiceBotField, addVoiceBotHoliday, archiveVoiceBot, createVoiceBot, deleteVoiceBotField, getVoiceBot, listVoiceBotHolidays, listVoiceBotNumbers,
    previewVoiceBot, resolveCallerDetails, restoreVoiceBot, setVoiceBotNumber, updateVoiceBot, voiceBotFieldCatalog,
} from "../src/lib/server/voice-bots";
import { claudeCapReached, getVoiceProviderSettings, providerKey, recordProviderUsage, saveVoiceProviderSettings } from "../src/lib/server/voice-providers";
import { createLeadForTenant } from "../src/lib/repositories/leads-postgres";
import { createOpportunityForTenant } from "../src/lib/repositories/opportunities-postgres";
import { createCustomFieldForTenant } from "../src/lib/server/admin-modules";
import { DEFAULT_VOICE_BOT_CONFIG } from "../src/lib/voice-bot-config";

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
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bots smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { opportunityEnabled: true }]);
        const roleId = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [roleId, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }]);
        const userId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Priya Sharma', 'x', $4, now())`, [userId, tenantId, `vb.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
        const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        const objectIds: Record<string, string> = {};
        for (const name of ["lead", "opportunity", "activity"]) {
            objectIds[name] = randomUUID();
            await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [objectIds[name], tenantId, name]);
        }
        const mbaType = randomUUID();
        const otherType = randomUUID();
        for (const [id, name] of [[mbaType, "MBA admission"], [otherType, "Scholarship"]]) {
            await q(`insert into "OpportunityType" (id, "tenantId", "objectId", name, "isActive", "updatedAt") values ($1, $2, $3, $4, true, now())`, [id, tenantId, objectIds.opportunity, name]);
            await q(`insert into "StageDefinition" (id, "tenantId", "opportunityTypeId", name, "order", "updatedAt") values ($1, $2, $3, 'Enquiry', 0, now())`, [randomUUID(), tenantId, id]);
        }

        // ---- Bots and their activity type ---------------------------------------------------------
        const bot = await createVoiceBot(user, { name: "Admission follow-up", config: { description: "Follow up MBA enquiries" } });
        const type = (await q(`select name, "systemKey", "isSystem" from "ActivityType" where id = $1`, [bot.activityTypeId])).rows[0];
        equal(type, { name: "Voice bot: Admission follow-up", systemKey: "VOICE_BOT", isSystem: true }, "a bot gets its own locked activity type");
        equal([bot.status, bot.config.ai, bot.config.description], ["DRAFT", "claude-haiku", "Follow up MBA enquiries"], "it starts as a draft with the defaults");
        await rejects(() => createVoiceBot(user, { name: "admission FOLLOW-UP" }), "VOICE_BOT_NAME_TAKEN", "names are unique, ignoring case");
        await rejects(() => updateVoiceBot(user, bot.id, { config: { ai: "gpt-5" } }), "VOICE_BOT_CONFIG_INVALID", "invalid settings are refused");
        await updateVoiceBot(user, bot.id, { name: "MBA follow-up" });
        equal((await q(`select name from "ActivityType" where id = $1`, [bot.activityTypeId])).rows[0].name, "Voice bot: MBA follow-up", "renaming the bot renames its activity type");
        await rejects(() => updateVoiceBot(user, bot.id, { status: "LIVE" }), "VOICE_BOT_NOT_READY", "it can't go live before it's ready");
        const detail = await getVoiceBot(user, bot.id);
        check(detail!.readiness.some((issue) => issue.message.includes("opening line")) && detail!.readiness.some((issue) => issue.message.includes("Groq key")), "and says what's missing");

        // ---- Fields ---------------------------------------------------------------------------------
        await addVoiceBotField(user, bot.id, { label: "Preferred intake", type: "DROPDOWN", options: ["Jan 2027", "Jul 2027"], question: "Which intake?", mustAsk: true });
        await addVoiceBotField(user, bot.id, { label: "Budget", type: "NUMBER", question: "What's your budget?", confirm: true });
        await rejects(() => addVoiceBotField(user, bot.id, { label: "Mode", type: "DROPDOWN", options: ["Online"] }), "VOICE_BOT_FIELD_OPTIONS_REQUIRED", "a list field needs two choices");
        const fields = (await getVoiceBot(user, bot.id))!.fields;
        equal(fields.map((field) => [field.key, field.type, field.mustAsk, field.confirm]), [["preferred_intake", "DROPDOWN", true, false], ["budget", "NUMBER", false, true]], "fields are saved with their questions");
        const definitionTypes = (await q(`select "entityTypeId" from "FieldDefinition" where id = any($1)`, [fields.map((field) => field.id)])).rows.map((row) => row.entityTypeId);
        check(definitionTypes.every((id) => id === bot.activityTypeId), "as custom fields of the bot's activity type");
        await updateVoiceBot(user, bot.id, { config: {
            mappings: [{ fieldKey: "budget", target: "opportunity.amount", mode: "OVERWRITE" }, { fieldKey: "preferred_intake", target: "lead.name", mode: "IF_EMPTY" }],
            fixedSteps: { before: [{ id: "s1", kind: "ask", text: "Shall we continue?", fieldKey: "budget", onAnswer: [] }], after: [] },
        } });
        await deleteVoiceBotField(user, bot.id, fields.find((field) => field.key === "budget")!.id);
        const afterDelete = (await getVoiceBot(user, bot.id))!;
        equal([afterDelete.fields.map((field) => field.key), afterDelete.config.mappings.map((mapping) => mapping.fieldKey), afterDelete.config.fixedSteps.before[0].fieldKey, "budget" in afterDelete.config.fieldQuestions],
            [["preferred_intake"], ["preferred_intake"], null, false], "deleting a field drops its mapping, step link and question");

        // ---- Caller details and preview -----------------------------------------------------------
        await createCustomFieldForTenant(user, { objectType: "LEAD", key: "course_interest", label: "Course interest", type: "TEXT" });
        const catalog = await voiceBotFieldCatalog(user);
        check(catalog.callerDetails.some((item) => item.key === "lead.course_interest" && item.group === "Lead · custom"), "the catalog lists custom lead fields");
        const lead: any = await createLeadForTenant(user, { name: "Asha Verma", phone: "9876543210", customFields: { course_interest: "MBA" } });
        await q(`update "Lead" set "ownerId" = $1 where id = $2`, [userId, lead.id]);
        const older: any = await createOpportunityForTenant(user, { title: "Scholarship 2026", leadId: lead.id, opportunityTypeId: otherType });
        await q(`update "Opportunity" set "updatedAt" = now() - interval '2 days' where id = $1`, [older.id]);
        await createOpportunityForTenant(user, { title: "MBA Jan 2027", leadId: lead.id, opportunityTypeId: mbaType });
        const config = { ...DEFAULT_VOICE_BOT_CONFIG, callerDetails: ["lead.firstName", "lead.course_interest", "opportunity.title", "owner.firstName"] };
        const latest = await resolveCallerDetails(user, config, { leadId: lead.id });
        equal(latest.values, { "lead.firstName": "Asha", "lead.course_interest": "MBA", "opportunity.title": "MBA Jan 2027", "owner.firstName": "Priya" }, "caller details: only the ticked fields, from the latest open opportunity");
        const ofType = await resolveCallerDetails(user, { ...config, opportunityChoice: { mode: "LATEST_OF_TYPE", typeId: otherType } }, { leadId: lead.id });
        equal(ofType.values["opportunity.title"], "Scholarship 2026", "or the latest of a chosen type");
        const none = await resolveCallerDetails(user, { ...config, opportunityChoice: { mode: "NONE", typeId: null } }, { leadId: lead.id });
        check(!("opportunity.title" in none.values), "or none");
        const preview = await previewVoiceBot(user, { ...config, openingLine: "Namaste {{lead.firstName|ji}}, {{owner.firstName}} here about {{lead.course_interest}}. {{lead.email|}}" }, { leadId: lead.id });
        equal(preview.openingLine, "Namaste Asha, Priya here about MBA.", "the preview fills placeholders and drops empty ones");

        // ---- Numbers ----------------------------------------------------------------------------------
        await setVoiceBotNumber(user, "+918000000001", { mode: "BOT", botId: bot.id });
        await setVoiceBotNumber(user, "+918000000002", { mode: "OWNER_THEN_BOT", botId: bot.id });
        await rejects(() => setVoiceBotNumber(user, "+918000000003", { mode: "BOT" }), "VOICE_BOT_NUMBER_BOT_REQUIRED", "a bot number needs a bot");
        await rejects(() => setVoiceBotNumber(user, "8000000003", { mode: "OWNER" }), "VOICE_BOT_NUMBER_INVALID", "numbers are E.164");
        const numbers = await listVoiceBotNumbers(user);
        equal(numbers.numbers.map((item) => [item.number, item.mode]).sort(), [["+918000000001", "BOT"], ["+918000000002", "OWNER_THEN_BOT"]], "without Plivo, the saved numbers are listed with who answers");

        // ---- Holidays -------------------------------------------------------------------------------------
        await addVoiceBotHoliday(user, { date: "2026-11-08", label: "Diwali" });
        await addVoiceBotHoliday(user, { date: "2026-11-08", label: "Diwali (renamed)" });
        equal((await listVoiceBotHolidays(user)).map((holiday) => [holiday.date, holiday.label]), [["2026-11-08", "Diwali (renamed)"]], "a date is listed once");

        // ---- Provider keys and Claude budget ---------------------------------------------------------------
        const saved = await saveVoiceProviderSettings(tenantId, userId, { groqKey: "gsk_smoke_1234567890", claudeMonthlyCapUsd: 10 });
        equal([saved.groq.configured, saved.groq.keyHint, saved.claude.monthlyCapUsd], [true, "…7890", 10], "a key is saved, shown only by its last four characters");
        const stored = (await q(`select config->>'groqKey' as key from "VoiceProviderSettings" where "tenantId" = $1`, [tenantId])).rows[0].key;
        check(stored.startsWith("v1:") && !stored.includes("gsk_smoke"), "and stored encrypted");
        equal(await providerKey(tenantId, "groq"), "gsk_smoke_1234567890", "the server can read it back");
        check(!JSON.stringify(await getVoiceProviderSettings(tenantId)).includes("gsk_smoke"), "the settings never include it");
        await recordProviderUsage(tenantId, "claude", { botId: bot.id, costMicroUsd: 6_000_000 });
        await recordProviderUsage(tenantId, "claude", { botId: bot.id, costMicroUsd: 3_000_000 });
        const alerts = (await q(`select level from "VoiceProviderAlert" where "tenantId" = $1 order by level`, [tenantId])).rows.map((row) => row.level);
        equal(alerts, [50, 80], "budget alerts are sent once per level as spend crosses them");
        equal(Number((await q(`select count(*) from "Notification" where "tenantId" = $1 and title like 'Claude budget%'`, [tenantId])).rows[0].count), 2, "admins are notified");
        check(!(await claudeCapReached(tenantId)), "under the cap, Claude can be used");
        await recordProviderUsage(tenantId, "claude", { botId: null, costMicroUsd: 1_500_000 });
        check(await claudeCapReached(tenantId), "at the cap, Claude is refused");
        equal((await getVoiceProviderSettings(tenantId)).claude.spentThisMonthUsd, 10.5, "the month's spend is shown");

        // ---- Archive and restore --------------------------------------------------------------------------------
        await archiveVoiceBot(user, bot.id);
        const handedBack = (await q(`select mode, "botId" from "VoiceBotNumber" where "tenantId" = $1 order by number`, [tenantId])).rows;
        check(handedBack.every((row) => row.mode === "OWNER" && row.botId === null), "archiving a bot hands its numbers back to people");
        await restoreVoiceBot(user, bot.id);
        equal((await getVoiceBot(user, bot.id))!.status, "DRAFT", "a restored bot comes back as a draft");

        console.log(`Voice bots smoke: ${checks} checks passed`);
    } finally {
        const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
        for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
        await q(`delete from "Tenant" where id = $1`, [tenantId]);
    }
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
