/**
 * Local-only real-database check for voice bot plan wave F (2026-10-27): what starts bot calls,
 * with a stand-in Plivo (its API answered here; its callbacks signed and sent through the real route).
 *   - new enquiries: a lead from a chosen source is queued at enquiry priority; other sources,
 *     imports and the bot's own inbound leads aren't;
 *   - automations: "Call with voice bot" queues the call and, waiting for the outcome, holds the
 *     automation until the call and its retries are over (or carries on at once when it can't call);
 *   - call campaigns dialled by a bot: members become bot calls a batch at a time, agents can't take
 *     them, pausing withdraws the waiting ones, and a member ends with the call's result;
 *   - incoming calls: Bot mode streams to the bot (a new lead for an unknown caller, decision 34);
 *     People then bot rings the owner in the bot's hours and the bot takes the call nobody answered,
 *     and answers at once outside them (decision 35); two calls running or the module off → people;
 *   - Voice bots switched off: queued calls wait (paused) and resume when it's back on.
 * A temporary tenant, removed afterwards. Run: tsx scripts/voice-bot-triggers-smoke.ts
 */
import { createRequire } from "module";
import { createHmac, randomUUID } from "crypto";
import { createServer } from "http";
import { rm } from "fs/promises";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { encryptSecretAtRest } from "../src/lib/server/secret-encryption";
import { plivoV3SignedString } from "../src/lib/server/plivo";
import { createVoiceBot, updateVoiceBot } from "../src/lib/server/voice-bots";
import { createLeadForTenant } from "../src/lib/repositories/leads-postgres";
import { createAutomationForTenant, executeAutomationWorkflow } from "../src/lib/repositories/automations-postgres";
import { createCallCampaignForTenant, getNextCampaignCallForAgent, updateCallCampaignForTenant } from "../src/lib/server/call-campaigns";
import { saveVoiceProviderSettings } from "../src/lib/server/voice-providers";
import { claimVoiceBotSession, endVoiceBotSession } from "../src/lib/server/voice-bot-sessions";
import { dispatchVoiceBotCalls, processVoiceBotCall } from "../src/lib/server/voice-bot-calls";
import { resetVoiceBotHealthCache } from "../src/lib/server/voice-bot-service";
import { resolveLocalStoragePath } from "../src/lib/storage/file-storage";
import { POST as plivoRoute } from "../src/app/api/integrations/telephony/plivo/[tenantId]/[action]/route";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");
const PUBLIC_URL = "https://crm.smoke.invalid";
const AUTH_TOKEN = "smoke-plivo-token";
const OUR_NUMBER = "+918000000000";

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
    const until = async (condition: () => Promise<boolean>, label: string) => {
        for (let tries = 0; tries < 100; tries++) {
            if (await condition()) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.fail(`timed out waiting: ${label}`);
    };

    const saved = { app: process.env.APP_URL, url: process.env.VOICE_BOT_SERVICE_URL, secret: process.env.VOICE_BOT_SERVICE_SECRET, public: process.env.VOICE_BOT_PUBLIC_URL };
    process.env.APP_URL = PUBLIC_URL;
    process.env.VOICE_BOT_SERVICE_SECRET = "triggers-smoke-secret-0123456789abcdef012345678";
    process.env.VOICE_BOT_PUBLIC_URL = "wss://crm.smoke.invalid/voice-bot";
    const health = createServer((_request, response) => response.writeHead(200).end("{}"));
    await new Promise<void>((resolve) => health.listen(0, "127.0.0.1", () => resolve()));
    process.env.VOICE_BOT_SERVICE_URL = `http://127.0.0.1:${(health.address() as any).port}`;
    resetVoiceBotHealthCache();

    // ---- Stand-in Plivo API, Google voice and Claude ------------------------------------------------
    const plivoCalls: any[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "https://api.plivo.com/v1/Account/MASMOKE/Call/") {
            plivoCalls.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ request_uuid: `req-${plivoCalls.length}` }), { status: 201 });
        }
        if (url.startsWith("https://api.plivo.com/")) return new Response(null, { status: 204 });
        if (url.startsWith("https://texttospeech.googleapis.com/")) return new Response(JSON.stringify({ audioContent: Buffer.alloc(1600).toString("base64") }), { status: 200 });
        if (url === "https://api.anthropic.com/v1/messages") {
            return new Response(JSON.stringify({
                content: [{ type: "tool_use", name: "call_summary", input: { summary: "Kiran asked about MBA fees and wants a brochure.", outcome: "interested", fields: {}, callbackAt: null, callerName: "Kiran Mehta" } }],
                stop_reason: "tool_use", usage: { input_tokens: 500, output_tokens: 60 },
            }), { status: 200 });
        }
        return realFetch(input, init);
    }) as typeof fetch;

    const tenantId = randomUUID();
    const send = (action: string, query: Record<string, string>, form: Record<string, string>) => {
        const url = new URL(`/api/integrations/telephony/plivo/${tenantId}/${action}`, PUBLIC_URL);
        for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
        const body = new URLSearchParams(form);
        const nonce = randomUUID();
        const signature = createHmac("sha256", AUTH_TOKEN).update(plivoV3SignedString(url.toString(), body, nonce)).digest("base64");
        return plivoRoute(new Request(url.toString().replace(PUBLIC_URL, "http://127.0.0.1:3000"), {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", "x-plivo-signature-v3": signature, "x-plivo-signature-v3-nonce": nonce },
            body: body.toString(),
        }), { params: Promise.resolve({ tenantId, action }) });
    };
    const callRow = async (id: string) => (await q(`select * from "VoiceBotCall" where id = $1`, [id])).rows[0];

    try {
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bot triggers smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { generalSettings: { timezone: "Asia/Kolkata" } }]);
        const adminRole = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [adminRole, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }]);
        const ownerId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, phone, "roleId", "updatedAt") values ($1, $2, $3, 'Priya Owner', 'x', '+919000000001', $4, now())`,
            [ownerId, tenantId, `owner.${ownerId.slice(0, 8)}@smoke.invalid`, adminRole]);
        const owner = { id: ownerId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        for (const name of ["lead", "opportunity", "activity"]) {
            await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [randomUUID(), tenantId, name]);
        }
        await q(`insert into "IntegrationSetting" (id, "tenantId", type, config, "isActive", "updatedAt") values ($1, $2, 'TELEPHONY', $3, true, now())`, [randomUUID(), tenantId, {
            provider: "plivo", plivoAuthId: "MASMOKE", plivoAuthTokenEncrypted: encryptSecretAtRest(AUTH_TOKEN), outboundCallerId: OUR_NUMBER, inboundNumber: OUR_NUMBER,
        }]);
        await saveVoiceProviderSettings(tenantId, ownerId, { groqKey: "gsk-triggers-smoke", googleKey: "AIza-triggers-smoke", claudeKey: "sk-ant-triggers-smoke" });
        const owned = async (input: Record<string, unknown>, actor: any = owner) => {
            const created: any = await createLeadForTenant(actor, input);
            await q(`update "Lead" set "ownerId" = $2 where id = $1`, [created.id, ownerId]);
            return created;
        };

        const bot = await createVoiceBot(owner, { name: "Triggers smoke bot" });
        const allDay = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59", skipHolidays: false };
        await updateVoiceBot(owner, bot.id, { config: {
            openingLine: "Namaste!", closingLine: "Dhanyavaad!", goal: "Help the caller.",
            voices: { hi: { provider: "google", voice: "hi-IN-Chirp3-HD-Aoede" }, en: { provider: "google", voice: "en-IN-Chirp3-HD-Aoede" } },
            calling: allDay, retries: { attempts: 1, gapsMinutes: [] }, keepAudio: false, transfer: { enabled: false, rule: "", teamId: null, ringSeconds: 20 },
            enquiryCalls: { enabled: true, sources: ["Website"] },
        } });
        await q(`update "VoiceBot" set status = 'LIVE' where id = $1`, [bot.id]);
        const cancelWaiting = () => q(`update "VoiceBotCall" set status = 'CANCELLED' where "tenantId" = $1 and status in ('QUEUED', 'DIALING', 'IN_PROGRESS')`, [tenantId]);

        // ---- New enquiries ------------------------------------------------------------------------------
        const enquiry: any = await owned({ name: "Web Enquiry", phone: "9811111111", source: "website" });
        const enquiryCall = (await q(`select trigger, priority, status, "leadId" from "VoiceBotCall" where "tenantId" = $1 and "leadId" = $2`, [tenantId, enquiry.id])).rows;
        equal(enquiryCall.map((row) => [row.trigger, row.priority, row.status]), [["ENQUIRY", 1, "QUEUED"]], "a new lead from a chosen source is queued at enquiry priority (sources match whatever the case)");
        const otherSource: any = await owned({ name: "Walk In", phone: "9811111112", source: "Walk-in" });
        const imported: any = await owned({ name: "Imported", phone: "9811111113", source: "Website" }, { ...owner, bulkCreate: true });
        const inboundLead: any = await owned({ name: "Bot Caller", phone: "9811111114", source: "Voice bot (inbound)" });
        equal(Number((await q(`select count(*) from "VoiceBotCall" where "leadId" = any($1)`, [[otherSource.id, imported.id, inboundLead.id]])).rows[0].count), 0, "other sources, imports and the bot's own inbound leads aren't called");
        await cancelWaiting();

        // ---- Voice bots switched off: queued calls wait -----------------------------------------------------
        const paused: any = await owned({ name: "Paused Call", phone: "9822222222", source: "Website" });
        const pausedId = (await q(`select id from "VoiceBotCall" where "leadId" = $1`, [paused.id])).rows[0].id;
        await q(`insert into "TenantModuleEntitlement" (id, "tenantId", "moduleKey", status) values ($1, $2, 'VOICE_BOT', 'DISABLED')`, [randomUUID(), tenantId]);
        const placedNone = await dispatchVoiceBotCalls({ tenantId, place: async () => undefined });
        equal([placedNone.placed, (await callRow(pausedId)).status], [0, "QUEUED"], "with Voice bots off, queued calls stay queued and nothing is dialled");
        const offAnswer = await (await send("answer", {}, { CallUUID: randomUUID(), Direction: "inbound", From: "919833333333", To: "918000000000" })).text();
        await q(`insert into "VoiceBotNumber" (id, "tenantId", number, mode, "botId") values ($1, $2, $3, 'BOT', $4)`, [randomUUID(), tenantId, OUR_NUMBER, bot.id]);
        const offAnswer2 = await (await send("answer", {}, { CallUUID: randomUUID(), Direction: "inbound", From: "919833333333", To: "918000000000" })).text();
        check(!offAnswer.includes("<Stream") && !offAnswer2.includes("<Stream"), "and a Bot number goes back to people's routing");
        await q(`delete from "TenantModuleEntitlement" where "tenantId" = $1`, [tenantId]);
        const placedOne = await dispatchVoiceBotCalls({ tenantId, place: async () => undefined });
        equal([placedOne.placed, (await callRow(pausedId)).status], [1, "DIALING"], "switched back on, the call is placed");
        await cancelWaiting();

        // ---- Automations ----------------------------------------------------------------------------------
        const workflow = {
            nodes: [
                { id: "t", type: "custom", data: { type: "trigger", label: "Start" } },
                { id: "call", type: "custom", data: { type: "call_with_voice_bot", label: "Call", botId: bot.id, waitForOutcome: true, maxWaitDays: 2 } },
                { id: "after", type: "custom", data: { type: "star_lead", label: "Star" } },
            ],
            edges: [{ id: "e1", source: "t", target: "call" }, { id: "e2", source: "call", target: "after" }],
        };
        const automation = await createAutomationForTenant(owner, { name: "Bot call smoke", trigger: { type: "MANUAL" }, workflow, isActive: false });
        const autoLead: any = await owned({ name: "Auto Lead", phone: "9844444444" });
        const log: any[] = await executeAutomationWorkflow(owner, automation, "LEAD", autoLead.id, autoLead, "LIVE");
        const stepLog = log.find((step: any) => step.node === "call" || step.nodeId === "call" || step.type === "call_with_voice_bot");
        check(stepLog?.status === "WAITING" && !log.some((step: any) => step.type === "star_lead"), "the step queues the call and the automation waits for the outcome");
        const autoCall = (await q(`select id, trigger, "automationQueueId" from "VoiceBotCall" where "leadId" = $1`, [autoLead.id])).rows[0];
        const waiting = (await q(`select status, "runAt", "resumeNodeIds" from "AutomationQueue" where id = $1`, [autoCall.automationQueueId])).rows[0];
        check(autoCall.trigger === "AUTOMATION" && waiting.status === "PENDING" && new Date(waiting.runAt).getTime() > Date.now() + 47 * 3600_000, "for at most two days");
        equal(waiting.resumeNodeIds, ["after"], "then the next step runs");
        await q(`update "VoiceBotCall" set status = 'NO_ANSWER', "endedAt" = now() where id = $1`, [autoCall.id]);
        await processVoiceBotCall(tenantId, autoCall.id);
        const released = (await q(`select "runAt", record->'voiceBotCall' as call from "AutomationQueue" where id = $1`, [autoCall.automationQueueId])).rows[0];
        check(new Date(released.runAt).getTime() <= Date.now() + 1000, "once the call (with no retries left) is over, the automation carries on");
        equal([released.call.outcome, released.call.status], ["NO_ANSWER", "NO_ANSWER"], "and its next steps can branch on voiceBotCall.outcome");
        const noPhone: any = await owned({ name: "No Phone" });
        await executeAutomationWorkflow(owner, automation, "LEAD", noPhone.id, noPhone, "LIVE");
        const blockedQueue = (await q(`select q."runAt", q.record->'voiceBotCall' as call from "VoiceBotCall" c join "AutomationQueue" q on q.id = c."automationQueueId" where c."leadId" = $1`, [noPhone.id])).rows[0];
        check(blockedQueue.call.outcome === "BLOCKED" && blockedQueue.call.blockedReason === "NO_PHONE" && new Date(blockedQueue.runAt).getTime() <= Date.now() + 1000, "a record the bot can't call carries on at once, as not called");
        await q(`update "AutomationQueue" set status = 'CANCELLED' where "tenantId" = $1`, [tenantId]);

        // ---- Call campaigns dialled by a bot -------------------------------------------------------------------
        await rejects(() => createCallCampaignForTenant(owner, { name: "No bot", dialledBy: "BOT" }), "CAMPAIGN_BOT_REQUIRED", "a bot-dialled campaign needs a bot");
        const campaign = await createCallCampaignForTenant(owner, { name: "Bot campaign", dialledBy: "BOT", voiceBotId: bot.id });
        equal([campaign.dialledBy, campaign.voiceBotId], ["BOT", bot.id], "a campaign can be dialled by a bot");
        const members: string[] = [];
        for (const index of [1, 2, 3]) {
            const lead: any = await owned({ name: `Campaign ${index}`, phone: `985555555${index}` });
            const memberId = randomUUID();
            members.push(memberId);
            await q(`insert into "CallCampaignMember" (id, "tenantId", "campaignId", "leadId", status) values ($1, $2, $3, $4, 'PENDING')`, [memberId, tenantId, campaign.id, lead.id]);
        }
        await updateCallCampaignForTenant(owner, campaign.id, { status: "ACTIVE" });
        await rejects(() => updateCallCampaignForTenant(owner, campaign.id, { dialledBy: "PEOPLE" }), "CAMPAIGN_DIALLER_LOCKED", "who dials an active campaign can't change");
        await rejects(() => getNextCampaignCallForAgent(owner, campaign.id), "CAMPAIGN_DIALLED_BY_BOT", "agents can't take a bot campaign's calls");
        await dispatchVoiceBotCalls({ tenantId, place: async () => undefined });
        const campaignCalls = (await q(`select id, trigger, "campaignMemberId", status from "VoiceBotCall" where "campaignMemberId" = any($1) order by "createdAt"`, [members])).rows;
        equal(campaignCalls.map((row) => row.trigger), ["CAMPAIGN", "CAMPAIGN", "CAMPAIGN"], "its pending members become bot calls");
        equal((await q(`select distinct status from "CallCampaignMember" where "campaignId" = $1`, [campaign.id])).rows.map((row) => row.status), ["QUEUED"], "and are marked as in progress");
        await updateCallCampaignForTenant(owner, campaign.id, { status: "PAUSED" });
        const afterPause = (await q(`select c.status as call, m.status as member from "VoiceBotCall" c join "CallCampaignMember" m on m.id = c."campaignMemberId" where c.status = 'CANCELLED' and m."campaignId" = $1`, [campaign.id])).rows;
        check(afterPause.length === 1 && afterPause[0].member === "PENDING", "pausing withdraws calls still waiting and puts those members back to pending");
        const dialled = campaignCalls.find((row) => row.status === "DIALING")!;
        await q(`update "VoiceBotCall" set status = 'COMPLETED', "answeredAt" = now(), "endedAt" = now() where id = $1`, [dialled.id]);
        await processVoiceBotCall(tenantId, dialled.id);
        equal((await q(`select status from "CallCampaignMember" where id = $1`, [dialled.campaignMemberId])).rows[0].status, "COMPLETED", "an answered call completes its member");
        await cancelWaiting();

        // ---- Incoming calls: Bot mode, an unknown caller (decision 34) ------------------------------------------
        const inboundUuid = randomUUID();
        const answer = await (await send("answer", {}, { CallUUID: inboundUuid, Direction: "inbound", From: "919876512345", To: "918000000000" })).text();
        const stream = /<Stream[^>]*>(wss:\/\/[^<]+)<\/Stream>/.exec(answer);
        check(stream && !answer.includes("<Record"), "a Bot number streams the call to the bot (no recording: the bot doesn't keep audio)");
        const inbound = await callRow(inboundUuid);
        equal([inbound.trigger, inbound.status, inbound.phone, inbound.fromNumber, inbound.leadId], ["INBOUND", "IN_PROGRESS", "+919876512345", OUR_NUMBER, null], "the bot call is Plivo's own call, from an unknown caller");
        const claim = await claimVoiceBotSession(stream![1].split("/").pop()!.replace(/&amp;/g, "&"));
        check(claim?.kind === "CALL" && claim.bot.sampleRate === 8000, "the bot service claims it");
        await endVoiceBotSession(claim!.sessionId, { outcome: "interested", durationSeconds: 40, transcript: [{ role: "bot", text: "Namaste!", language: "hi", at: 0 }, { role: "caller", text: "Main Kiran Mehta, MBA fees kya hai?", language: "hi", at: 3 }] });
        await send("event", { source: "hangup" }, { CallUUID: inboundUuid, CallStatus: "completed", Duration: "41", Direction: "inbound" });
        await until(async () => !!(await callRow(inboundUuid)).outcome, "inbound processing");
        const processed = await callRow(inboundUuid);
        const newLead = (await q(`select id, name, phone, source from "Lead" where id = $1`, [processed.leadId])).rows[0];
        equal([newLead?.name, newLead?.phone, newLead?.source], ["Kiran Mehta", "+919876512345", "Voice bot (inbound)"], "an unknown caller becomes a lead, named from the call");
        check(processed.activityId && (await q(`select "leadId" from "Activity" where id = $1`, [processed.activityId])).rows[0].leadId === newLead.id, "with the bot's activity on it");
        equal(Number((await q(`select count(*) from "VoiceBotCall" where "leadId" = $1 and trigger = 'ENQUIRY'`, [newLead.id])).rows[0].count), 0, "and no enquiry call back to them");
        equal(Number((await q(`select count(*) from "Activity" a join "ActivityType" t on t.id = a."typeId" where a."leadId" = $1 and t."systemKey" is distinct from 'VOICE_BOT'`, [newLead.id])).rows[0].count), 0, "and no generic Call activity");

        // Two calls already running: people's routing instead.
        await q(`insert into "VoiceBotCall" (id, "tenantId", "botId", trigger, status, phone) values ($1, $3, $4, 'MANUAL', 'IN_PROGRESS', '+911'), ($2, $3, $4, 'MANUAL', 'IN_PROGRESS', '+912')`, [randomUUID(), randomUUID(), tenantId, bot.id]);
        const busy = await (await send("answer", {}, { CallUUID: randomUUID(), Direction: "inbound", From: "919876500000", To: "918000000000" })).text();
        check(!busy.includes("<Stream"), "with two calls already running, the call goes to people");
        await cancelWaiting();

        // ---- People then bot (decisions 23, 35) ----------------------------------------------------------------
        await q(`update "VoiceBotNumber" set mode = 'OWNER_THEN_BOT' where "tenantId" = $1`, [tenantId]);
        const known: any = await owned({ name: "Known Caller", phone: "9877700000" });
        const ringUuid = randomUUID();
        const ring = await (await send("answer", {}, { CallUUID: ringUuid, Direction: "inbound", From: "919877700000", To: "918000000000" })).text();
        check(ring.includes("<Number>+919000000001</Number>") && !ring.includes("<Stream"), "in the bot's hours, the owner's phone rings first");
        await until(async () => (await q(`select 1 from "TelephonyCallLog" where "tenantId" = $1 and "callId" = $2`, [tenantId, ringUuid])).rowCount === 1, "inbound call log");
        const takeover = await (await send("dial-status", { callId: ringUuid, stage: "primary" }, { CallUUID: ringUuid, DialStatus: "no-answer", Direction: "inbound", From: "919877700000", To: "918000000000" })).text();
        check(takeover.includes("<Stream"), "nobody answering, the bot takes the call");
        const takenOver = await callRow(ringUuid);
        equal([takenOver.trigger, takenOver.leadId], ["INBOUND", known.id], "on the caller's lead");
        await cancelWaiting();
        const today = new Date(Date.now() + 5.5 * 3600_000).getUTCDay();
        await updateVoiceBot(owner, bot.id, { config: { calling: { ...allDay, days: [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== today) } } });
        const afterHours = await (await send("answer", {}, { CallUUID: randomUUID(), Direction: "inbound", From: "919877700000", To: "918000000000" })).text();
        check(afterHours.includes("<Stream") && !afterHours.includes("<Dial"), "outside the bot's hours, the bot answers at once");
    } finally {
        globalThis.fetch = realFetch;
        health.close();
        for (const [key, value] of [["APP_URL", saved.app], ["VOICE_BOT_SERVICE_URL", saved.url], ["VOICE_BOT_SERVICE_SECRET", saved.secret], ["VOICE_BOT_PUBLIC_URL", saved.public]] as const) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(resolveLocalStoragePath(`voice-bot-cache/${tenantId}`), { recursive: true, force: true });
        const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
        for (let pass = 0; pass < 8; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
        await q(`delete from "Tenant" where id = $1`, [tenantId]);
    }
    console.log(`Voice bot triggers smoke: ${checks} checks passed`);
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
