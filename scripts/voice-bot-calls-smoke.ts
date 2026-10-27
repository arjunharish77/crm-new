/**
 * Local-only real-database check for voice bot plan wave E (2026-10-27): bot phone calls, end to
 * end, with a stand-in Plivo (its API is answered here; its callbacks are signed and sent through
 * the real route).
 *   - queueing: access and the bulk switch, and records that can't be called kept as BLOCKED with
 *     the reason (no phone, already waiting, the stop list);
 *   - dispatching: at most two calls at a time, calling hours, the Plivo request (machine detection,
 *     time limit), a call log without a generic Call activity;
 *   - answered: the stream address (a fresh single-use token) and whole-call recording, the call
 *     claimed by the bot service with Plivo's credentials;
 *   - hand-over: owner, then the online team agent, notifications, then the bot's "nobody is free"
 *     line in its own voice (a signed address);
 *   - after the call: Claude's summary, the bot's activity with its fields, mapping to the lead
 *     ("set by voice bot" in its history), a callback task, the transcript on the call log;
 *   - not answered / a machine: a retry inside calling hours; "don't call me": the stop list.
 * A temporary tenant, removed afterwards. Run: tsx scripts/voice-bot-calls-smoke.ts
 */
import { createRequire } from "module";
import { createHmac, randomUUID } from "crypto";
import { createServer } from "http";
import { rm } from "fs/promises";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { encryptSecretAtRest } from "../src/lib/server/secret-encryption";
import { plivoV3SignedString } from "../src/lib/server/plivo";
import { addVoiceBotField, createVoiceBot, updateVoiceBot } from "../src/lib/server/voice-bots";
import { createCustomFieldForTenant } from "../src/lib/server/admin-modules";
import { createLeadForTenant } from "../src/lib/repositories/leads-postgres";
import { saveVoiceProviderSettings } from "../src/lib/server/voice-providers";
import { claimVoiceBotSession, endVoiceBotSession } from "../src/lib/server/voice-bot-sessions";
import {
    MAX_ACTIVE_CALLS_PER_WORKSPACE, dispatchVoiceBotCalls, getVoiceBotCallDetail, nextCallingTime, processVoiceBotCall, queueTestPhoneCall, queueVoiceBotCalls,
    requestVoiceBotTransfer, signedLineAudio,
} from "../src/lib/server/voice-bot-calls";
import { resetVoiceBotHealthCache } from "../src/lib/server/voice-bot-service";
import { resolveLocalStoragePath } from "../src/lib/storage/file-storage";
import { POST as plivoRoute } from "../src/app/api/integrations/telephony/plivo/[tenantId]/[action]/route";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");
const PUBLIC_URL = "https://crm.smoke.invalid";
const AUTH_TOKEN = "smoke-plivo-token";

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
    process.env.VOICE_BOT_SERVICE_SECRET = "calls-smoke-secret-0123456789abcdef0123456789";
    process.env.VOICE_BOT_PUBLIC_URL = "wss://crm.smoke.invalid/voice-bot";
    const health = createServer((_request, response) => response.writeHead(200).end("{}"));
    await new Promise<void>((resolve) => health.listen(0, "127.0.0.1", () => resolve()));
    process.env.VOICE_BOT_SERVICE_URL = `http://127.0.0.1:${(health.address() as any).port}`;
    resetVoiceBotHealthCache();

    // ---- Stand-in Plivo API, Google voice and Claude ------------------------------------------------
    const plivoCalls: any[] = [];
    const plivoTransfers: any[] = [];
    const plivoHangups: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "https://api.plivo.com/v1/Account/MASMOKE/Call/") {
            plivoCalls.push(JSON.parse(init.body));
            return new Response(JSON.stringify({ request_uuid: `req-${plivoCalls.length}` }), { status: 201 });
        }
        if (url.startsWith("https://api.plivo.com/v1/Account/MASMOKE/Call/")) {
            if (init?.method === "DELETE") { plivoHangups.push(url); return new Response(null, { status: 204 }); }
            plivoTransfers.push({ url, body: JSON.parse(init.body) });
            return new Response(JSON.stringify({ message: "call transferred" }), { status: 202 });
        }
        if (url.startsWith("https://texttospeech.googleapis.com/")) return new Response(JSON.stringify({ audioContent: Buffer.alloc(1600).toString("base64") }), { status: 200 });
        if (url === "https://api.anthropic.com/v1/messages") {
            return new Response(JSON.stringify({
                content: [{ type: "tool_use", name: "call_summary", input: { summary: "Asha wants the January MBA intake and asked for a callback tomorrow at 5 pm.", outcome: "interested", fields: { city: "Mumbai", preferred_intake: "January 2027" }, callbackAt: new Date(Date.now() + 26 * 3600_000).toISOString() } }],
                stop_reason: "tool_use", usage: { input_tokens: 900, output_tokens: 80 },
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

    try {
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bot calls smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { generalSettings: { timezone: "Asia/Kolkata" } }]);
        const adminRole = randomUUID();
        const useRole = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now()), ($4, $2, 'Smoke caller', $5, now())`,
            [adminRole, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }, useRole, { recordAccess: "ALL", modules: { voiceBots: "write" } }]);
        const ownerId = randomUUID();
        const agentId = randomUUID();
        const callerUserId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, phone, "roleId", "updatedAt") values
                 ($1, $4, $5, 'Priya Owner', 'x', '+919000000001', $7, now()),
                 ($2, $4, $6, 'Ravi Agent', 'x', '+919000000002', $7, now()),
                 ($3, $4, $8, 'Uma User', 'x', null, $9, now())`,
            [ownerId, agentId, callerUserId, tenantId, `owner.${ownerId.slice(0, 8)}@smoke.invalid`, `agent.${agentId.slice(0, 8)}@smoke.invalid`, adminRole, `user.${callerUserId.slice(0, 8)}@smoke.invalid`, useRole]);
        const owner = { id: ownerId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        const plainUser = { id: callerUserId, tenantId, role: { permissions: { recordAccess: "ALL", modules: { voiceBots: "write" } } } } as any;
        for (const name of ["lead", "opportunity", "activity"]) {
            await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [randomUUID(), tenantId, name]);
        }
        const teamId = randomUUID();
        await q(`insert into "Team" (id, "tenantId", name) values ($1, $2, 'Admissions')`, [teamId, tenantId]);
        await q(`insert into "TeamMember" (id, "tenantId", "teamId", "userId") values ($1, $2, $3, $4)`, [randomUUID(), tenantId, teamId, agentId]);
        await q(`insert into "AgentAvailability" (id, "tenantId", "userId", status) values ($1, $2, $3, 'ONLINE')`, [randomUUID(), tenantId, agentId]);
        await q(`insert into "IntegrationSetting" (id, "tenantId", type, config, "isActive", "updatedAt") values ($1, $2, 'TELEPHONY', $3, true, now())`, [randomUUID(), tenantId, {
            provider: "plivo", plivoAuthId: "MASMOKE", plivoAuthTokenEncrypted: encryptSecretAtRest(AUTH_TOKEN), outboundCallerId: "+918000000000", inboundNumber: "+918000000000",
        }]);
        await saveVoiceProviderSettings(tenantId, ownerId, { groqKey: "gsk-calls-smoke", googleKey: "AIza-calls-smoke", claudeKey: "sk-ant-calls-smoke" });

        await createCustomFieldForTenant(owner, { objectType: "LEAD", key: "intake", label: "Intake", type: "TEXT" });
        await createCustomFieldForTenant(owner, { objectType: "LEAD", key: "city", label: "City", type: "TEXT" });
        // createLeadForTenant doesn't take an owner from its input; leads here are Priya's.
        const owned = async (input: Record<string, unknown>) => {
            const created: any = await createLeadForTenant(owner, input);
            await q(`update "Lead" set "ownerId" = $2 where id = $1`, [created.id, ownerId]);
            return created;
        };
        const lead: any = await owned({ name: "Asha Rao", phone: "9876543210", customFields: { city: "Pune" } });
        const noPhone: any = await owned({ name: "No Phone" });

        const bot = await createVoiceBot(owner, { name: "Calls smoke bot" });
        await addVoiceBotField(owner, bot.id, { label: "Preferred intake", type: "DROPDOWN", options: ["January 2027", "July 2027"], question: "Which intake?" });
        await addVoiceBotField(owner, bot.id, { label: "City", type: "TEXT" });
        const allDay = { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59", skipHolidays: false };
        await updateVoiceBot(owner, bot.id, { config: {
            openingLine: "Namaste {{lead.firstName|ji}}!", closingLine: "Dhanyavaad!", goal: "Find the intake.", callerDetails: ["lead.firstName"],
            voices: { hi: { provider: "google", voice: "hi-IN-Chirp3-HD-Aoede" }, en: { provider: "google", voice: "en-IN-Chirp3-HD-Aoede" } },
            calling: allDay, retries: { attempts: 2, gapsMinutes: [120] }, answeringMachine: "NOT_ANSWERED", keepAudio: true,
            transfer: { enabled: true, rule: "", teamId, ringSeconds: 20 },
            mappings: [{ fieldKey: "preferred_intake", target: "lead.intake", mode: "IF_EMPTY" }, { fieldKey: "city", target: "lead.city", mode: "OVERWRITE" }],
        } });

        // ---- Queueing --------------------------------------------------------------------------------------
        await rejects(() => queueVoiceBotCalls(owner, bot.id, { targets: [{ leadId: lead.id }] }), "VOICE_BOT_CALL_NOT_LIVE", "a draft bot can't call records");
        await q(`update "VoiceBot" set status = 'LIVE' where id = $1`, [bot.id]);
        await rejects(() => queueVoiceBotCalls(plainUser, bot.id, { targets: [{ leadId: lead.id }, { leadId: noPhone.id }] }), "VOICE_BOT_BULK_NOT_ALLOWED", "calling several records needs the bulk switch");
        const queued = await queueVoiceBotCalls(plainUser, bot.id, { targets: [{ leadId: lead.id }] });
        equal(queued.queued, 1, "a user with the Use level queues a call");
        const again = await queueVoiceBotCalls(owner, bot.id, { targets: [{ leadId: lead.id }, { leadId: noPhone.id }] });
        equal(again.blocked.map((item) => item.reason).sort(), ["A call to this number by this bot is already waiting.", "The record has no phone number."], "records that can't be called are kept with the reason");
        const firstCallId = queued.callIds[0];

        // ---- Dispatching --------------------------------------------------------------------------------------
        const extra: string[] = [];
        for (const index of [1, 2, 3]) {
            const other: any = await owned({ name: `Lead ${index}`, phone: `987654321${index}` });
            extra.push((await queueVoiceBotCalls(owner, bot.id, { targets: [{ leadId: other.id }] })).callIds[0]);
        }
        await dispatchVoiceBotCalls({ tenantId });
        const active = (await q(`select id from "VoiceBotCall" where "tenantId" = $1 and status = 'DIALING'`, [tenantId])).rows.map((row) => row.id);
        equal(active.length, MAX_ACTIVE_CALLS_PER_WORKSPACE, "at most two calls run at once");
        check(active.includes(firstCallId), "the oldest call goes first");
        const request = plivoCalls[0];
        equal([request.from, request.to, request.machine_detection, request.ring_timeout], ["+918000000000", "+919876543210", "true", 30], "Plivo is asked to call the lead from the bot's number, detecting machines");
        check(request.answer_url.includes(`callId=${firstCallId}`) && request.answer_url.includes("flow=bot") && request.machine_detection_url.includes("/machine?"), "with the bot's answer and machine addresses");
        equal(request.time_limit, 8 * 60 + 180, "and a time limit past the bot's longest call");
        const callLog = (await q(`select id, status, metadata, "activityId" from "TelephonyCallLog" where "tenantId" = $1 and "callId" = $2`, [tenantId, firstCallId])).rows[0];
        equal([callLog.status, callLog.metadata.voiceBotCallId, callLog.activityId], ["dialing", firstCallId, null], "the call is logged, without a generic Call activity");
        for (const id of extra) await q(`update "VoiceBotCall" set status = 'CANCELLED' where id = $1 and status = 'QUEUED'`, [id]);

        // Calling hours: outside them, a call waits for the next opening.
        const window = nextCallingTime({ days: [1], start: "10:00", end: "19:00", skipHolidays: true }, new Set(["2026-11-02"]), "Asia/Kolkata", new Date("2026-10-31T08:00:00Z"));
        equal(window?.toISOString(), "2026-11-09T04:30:00.000Z", "the next opening skips other days and holidays (Monday 10:00 IST a week on)");

        // ---- Answered ------------------------------------------------------------------------------------------
        const answer = await send("answer", { callId: firstCallId, flow: "bot" }, { CallUUID: "uuid-1", Direction: "outbound", From: "918000000000", To: "919876543210" });
        const xml = await answer.text();
        const stream = /<Stream[^>]*>(wss:\/\/[^<]+)<\/Stream>/.exec(xml);
        check(answer.status === 200 && stream && xml.includes('bidirectional="true"') && xml.includes('contentType="audio/x-mulaw;rate=8000"'), "an answered call is streamed to the bot service");
        check(xml.includes('<Record recordSession="true"'), "and recorded whole, since the bot keeps audio");
        const token = stream![1].split("/").pop()!.replace(/&amp;/g, "&");
        const claim = await claimVoiceBotSession(token);
        check(claim && claim.kind === "CALL" && claim.plivo?.authId === "MASMOKE" && claim.bot.sampleRate === 8000, "the bot service claims it, with Plivo's credentials, at phone quality");
        const call = (await q(`select status, "plivoCallUuid", "answeredAt" from "VoiceBotCall" where id = $1`, [firstCallId])).rows[0];
        check(call.status === "IN_PROGRESS" && call.plivoCallUuid === "uuid-1" && call.answeredAt, "the call is under way");

        // ---- Hand-over: owner, then the online agent, then the bot's own "nobody is free" ------------------------
        const sessionId = claim!.sessionId;
        const transfer = await requestVoiceBotTransfer(sessionId, { reason: "wants to apply", transcript: [{ role: "caller", text: "Mujhe kisi se baat karni hai" }] });
        equal(transfer, { ok: true, people: 2 }, "a hand-over rings the owner, then the online team agent");
        check(plivoTransfers[0]?.url.endsWith("/Call/uuid-1/") && plivoTransfers[0].body.legs === "aleg" && plivoTransfers[0].body.aleg_url.includes("flow=bot-transfer"), "through Plivo's transfer API");
        equal(Number((await q(`select count(*) from "Notification" where "tenantId" = $1 and title like 'Voice bot % is handing you a call'`, [tenantId])).rows[0].count), 2, "both are told who's coming");
        const first = await (await send("answer", { callId: firstCallId, flow: "bot-transfer" }, { CallUUID: "uuid-1" })).text();
        check(first.includes("<Number>+919000000001</Number>") && first.includes("stage=transfer-0") && first.includes('timeout="20"'), "the owner's phone rings first");
        const second = await (await send("dial-status", { callId: firstCallId, stage: "transfer-0" }, { DialStatus: "no-answer" })).text();
        check(second.includes("<Number>+919000000002</Number>") && second.includes("stage=transfer-1"), "then the agent's");
        const last = await (await send("dial-status", { callId: firstCallId, stage: "transfer-1" }, { DialStatus: "no-answer" })).text();
        const play = /<Play>([^<]+)<\/Play>/.exec(last);
        check(play && last.includes("<Hangup/>"), "nobody answering plays the bot's line and ends the call");
        const wav = await signedLineAudio(play![1].replace(/&amp;/g, "&").split("/").pop()!);
        check(wav && wav.toString("ascii", 0, 4) === "RIFF" && wav.readUInt32LE(24) === 8000, "the line is the bot's own recording, at phone quality");
        equal(await signedLineAudio(play![1].split("/").pop()!.replace(/^./, "x")), null, "a tampered address plays nothing");

        // ---- After the call ------------------------------------------------------------------------------------
        await endVoiceBotSession(sessionId, {
            outcome: "callback", durationSeconds: 95,
            transcript: [{ role: "bot", text: "Namaste Asha!", language: "hi", at: 0.2 }, { role: "caller", text: "January wala intake. Kal shaam 5 baje call karna.", language: "hi", at: 4 }],
            turns: [{ replyMs: 820 }], fields: { preferred_intake: "January 2027" },
            events: [{ type: "callback_booked", at: 30, detail: { when: "kal shaam 5 baje" } }, { type: "transfer_failed", at: 40, detail: {} }],
        });
        await send("event", { callId: firstCallId, source: "hangup" }, { CallUUID: "uuid-1", CallStatus: "completed", Duration: "96", HangupCauseName: "NORMAL_CLEARING" });
        await until(async () => !!(await q(`select "processedAt" from "VoiceBotCall" where id = $1`, [firstCallId])).rows[0].processedAt && !!(await q(`select "activityId" from "VoiceBotCall" where id = $1`, [firstCallId])).rows[0].activityId, "after-call work");
        const detail = await getVoiceBotCallDetail(owner, bot.id, firstCallId);
        equal([detail.status, detail.outcome, detail.durationSeconds], ["COMPLETED", "callback", 96], "the call is complete, with the bot's outcome and its length");
        equal(detail.summary, "Asha wants the January MBA intake and asked for a callback tomorrow at 5 pm.", "Claude wrote the summary");
        equal(Object.fromEntries(detail.fields.map((field: any) => [field.key, field.value])), { preferred_intake: "January 2027", city: "Mumbai" }, "fields from the call and the summary are combined");
        const activity = (await q(`select a."typeId", a.outcome, a.notes, a."completedAt", t."systemKey" from "Activity" a join "ActivityType" t on t.id = a."typeId" where a.id = $1`, [detail.activityId])).rows[0];
        check(activity.systemKey === "VOICE_BOT" && activity.outcome === "Callback booked" && activity.notes.startsWith("Asha wants") && activity.completedAt, "the lead gets the bot's own activity, completed");
        const values = (await q(`select fd.key, cv."valueString" from "CustomFieldValue" cv join "FieldDefinition" fd on fd.id = cv."fieldDefinitionId" where cv."recordId" = $1 order by fd.key`, [detail.activityId])).rows;
        equal(values.map((row) => [row.key, row.valueString]), [["city", "Mumbai"], ["preferred_intake", "January 2027"]], "with the bot's fields filled");
        const updated = (await q(`select fd.key, cv."valueString" from "CustomFieldValue" cv join "FieldDefinition" fd on fd.id = cv."fieldDefinitionId" where cv."recordId" = $1 order by fd.key`, [lead.id])).rows;
        equal(updated.map((row) => [row.key, row.valueString]), [["city", "Mumbai"], ["intake", "January 2027"]], "answers are copied to the lead: an empty field filled, an overwrite field replaced");
        const history = (await q(`select metadata->'source' as source, diff from "AuditLog" where "tenantId" = $1 and "entityType" = 'LEAD' and "entityId" = $2 and action = 'UPDATE'`, [tenantId, lead.id])).rows[0];
        equal(history.source?.kind, "VOICE_BOT", "the lead's history shows the change as set by the voice bot");
        const task = (await q(`select title, "ownerId", "leadId", metadata from "Task" where "tenantId" = $1`, [tenantId])).rows[0];
        check(task && task.ownerId === ownerId && task.leadId === lead.id && task.title.includes("kal shaam 5 baje") && task.metadata.source === "VOICE_BOT", "the owner gets a callback task");
        const loggedCall = (await q(`select transcript, "activityId", duration, status from "TelephonyCallLog" where id = $1`, [callLog.id])).rows[0];
        check(loggedCall.transcript.includes("Caller: January wala intake") && loggedCall.activityId === detail.activityId && loggedCall.status === "completed", "the call log has the transcript and links the activity");
        check(Number((await q(`select sum("costMicroUsd") as c from "VoiceProviderUsage" where "tenantId" = $1 and provider = 'claude'`, [tenantId])).rows[0].c) > 0, "the summary's cost counts against the Claude budget");
        equal(await processVoiceBotCall(tenantId, firstCallId), null, "the after-call work runs once");

        // ---- Not answered, a machine, a retry ------------------------------------------------------------------------
        const second2 = active.find((id) => id !== firstCallId)!;
        await send("machine", { callId: second2 }, { CallUUID: "uuid-2", Machine: "true", Event: "MachineDetection" });
        check(plivoHangups.some((url) => url.endsWith("/Call/uuid-2/")), "an answering machine is hung up on");
        await send("event", { callId: second2, source: "hangup" }, { CallUUID: "uuid-2", CallStatus: "completed", HangupCauseName: "NORMAL_CLEARING" });
        await until(async () => !!(await q(`select outcome from "VoiceBotCall" where id = $1`, [second2])).rows[0].outcome, "machine processing");
        const machine = (await q(`select status, outcome, results from "VoiceBotCall" where id = $1`, [second2])).rows[0];
        equal([machine.status, machine.outcome], ["MACHINE", "MACHINE"], "it counts as not answered");
        const retry = (await q(`select attempt, priority, status, "notBefore", "firstAttemptId" from "VoiceBotCall" where id = $1`, [machine.results.retry.id])).rows[0];
        check(retry.attempt === 2 && retry.priority === 2 && retry.status === "QUEUED" && retry.firstAttemptId === second2, "and is retried as attempt 2, at retry priority");
        check(new Date(retry.notBefore).getTime() > Date.now() + 110 * 60_000, "after the bot's 2-hour gap");
        const noteActivity = (await q(`select a.notes from "Activity" a join "VoiceBotCall" c on c."activityId" = a.id where c.id = $1`, [second2])).rows[0];
        check(noteActivity?.notes.startsWith("Answering machine (attempt 1 of 2)"), "the lead's timeline shows the attempt");

        // ---- "Don't call me" ----------------------------------------------------------------------------------------
        await q(`update "VoiceBotCall" set status = 'CANCELLED' where "tenantId" = $1 and status = 'QUEUED'`, [tenantId]);
        await q(`update "VoiceBotCall" set "answeredAt" = null where id = $1`, [firstCallId]);
        const dnc: any = await owned({ name: "Stop Me", phone: "9123456780" });
        const dncCall = (await queueVoiceBotCalls(owner, bot.id, { targets: [{ leadId: dnc.id }] })).callIds[0];
        await dispatchVoiceBotCalls({ tenantId });
        const dncAnswer = await (await send("answer", { callId: dncCall, flow: "bot" }, { CallUUID: "uuid-3" })).text();
        const dncClaim = await claimVoiceBotSession(/<Stream[^>]*>(wss:\/\/[^<]+)<\/Stream>/.exec(dncAnswer)![1].split("/").pop()!);
        await endVoiceBotSession(dncClaim!.sessionId, { outcome: "do_not_call", transcript: [{ role: "caller", text: "Mujhe call mat karo", language: "hi", at: 2 }], events: [{ type: "stop_bot_calls", at: 3, detail: {} }] });
        await send("event", { callId: dncCall, source: "hangup" }, { CallUUID: "uuid-3", CallStatus: "completed", Duration: "12" });
        await until(async () => !!(await q(`select outcome from "VoiceBotCall" where id = $1`, [dncCall])).rows[0].outcome, "stop-list processing");
        check((await q(`select 1 from "VoiceBotStopList" where "tenantId" = $1 and "phoneDigits" = '9123456780'`, [tenantId])).rowCount === 1, "the number goes on the bot stop list");
        const blocked = await queueVoiceBotCalls(owner, bot.id, { targets: [{ leadId: dnc.id }] });
        equal(blocked.blocked[0]?.reason, "This number asked for no bot calls.", "and no bot calls it again");

        // ---- Call my phone --------------------------------------------------------------------------------------------
        await q(`update "VoiceBot" set status = 'DRAFT' where id = $1`, [bot.id]);
        const test = await queueTestPhoneCall(owner, bot.id, "");
        equal(test.phone, "+919000000001", "Call my phone uses the profile phone, even for a draft bot");
        await rejects(() => queueTestPhoneCall(owner, bot.id, ""), "VOICE_BOT_CALL_TEST_RUNNING", "one test call at a time");
        await dispatchVoiceBotCalls({ tenantId });
        const testRequest = plivoCalls[plivoCalls.length - 1];
        check(testRequest.to === "+919000000001" && !("machine_detection" in testRequest), "it calls you without machine detection");
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
    console.log(`Voice bot calls smoke: ${checks} checks passed`);
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
