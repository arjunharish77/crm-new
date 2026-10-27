/**
 * Local-only real-database check for voice bot plan wave C (2026-10-27), the CRM's side of a
 * conversation with the bot service:
 *   - a test call is refused, in plain words, until the service, keys, opening line and voices are there;
 *   - starting one records the fixed lines once (cached; repeats cost no characters) and keeps no keys;
 *   - the service claims it once, within its time, and gets the keys and the recorded audio;
 *   - usage is counted (Claude cost, Whisper seconds, voice characters); the report is stored once,
 *     with only the bot's own fields; the internal routes refuse unsigned requests;
 *   - the voice moves to Azure, then to Google at the paid rate with one alert (decision 33);
 *   - housekeeping expires unclaimed tokens and closes conversations never reported.
 * A temporary tenant, removed afterwards. Google is stood in for; nothing leaves this machine.
 * Run: tsx scripts/voice-bot-sessions-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import { createServer } from "http";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { addVoiceBotField, createVoiceBot, getVoiceBot, updateVoiceBot } from "../src/lib/server/voice-bots";
import { claimVoiceBotSession, createTestSession, endVoiceBotSession, getVoiceBotSession, recordVoiceBotSessionUsage } from "../src/lib/server/voice-bot-sessions";
import { resetVoiceBotHealthCache, signVoiceBotRequest } from "../src/lib/server/voice-bot-service";
import { FREE_VOICE_CHARACTERS, saveVoiceProviderSettings } from "../src/lib/server/voice-providers";
import { VOICE_BOT_SESSION_CLOSING } from "../src/lib/server/housekeeping";
import { executeAsSystem } from "../src/lib/db/query";
import { createLeadForTenant } from "../src/lib/repositories/leads-postgres";
import { POST as claimRoute } from "../src/app/api/internal/voice-bot/sessions/claim/route";
import { resolveLocalStoragePath } from "../src/lib/storage/file-storage";
import { rm } from "fs/promises";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");
const SECRET = "smoke-secret-0123456789abcdef0123456789abcdef";

// A tiny WAV of silence, as Google's LINEAR16 answer would be.
function wav(samples: number) {
    const data = Buffer.alloc(samples * 2);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8, "ascii");
    header.write("fmt ", 12, "ascii"); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write("data", 36, "ascii"); header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

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

    // Google stand-in: every synthesis answers with silence, and is counted.
    const realFetch = globalThis.fetch;
    let googleCalls = 0;
    let azureCalls = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.startsWith("https://texttospeech.googleapis.com/v1/text:synthesize")) {
            googleCalls++;
            assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "AIza-smoke-google-key", "the key goes in a header, not the address");
            return new Response(JSON.stringify({ audioContent: wav(2400).toString("base64") }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url === "https://centralindia.tts.speech.microsoft.com/cognitiveservices/v1") {
            azureCalls++;
            return new Response(Buffer.alloc(4800), { status: 200, headers: { "content-type": "audio/L16" } });
        }
        return realFetch(input, init);
    }) as typeof fetch;

    // Bot service stand-in: only its health check is needed here.
    const health = createServer((request, response) => { response.writeHead(request.url === "/health" ? 200 : 404); response.end("{}"); });
    await new Promise<void>((resolve) => health.listen(0, "127.0.0.1", () => resolve()));
    const servicePort = (health.address() as any).port;
    const savedEnv = { url: process.env.VOICE_BOT_SERVICE_URL, secret: process.env.VOICE_BOT_SERVICE_SECRET, public: process.env.VOICE_BOT_PUBLIC_URL };

    const tenantId = randomUUID();
    try {
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bot sessions smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, {}]);
        const roleId = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [roleId, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }]);
        const userId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Priya Sharma', 'x', $4, now())`, [userId, tenantId, `vbs.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
        const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        for (const name of ["lead", "opportunity", "activity"]) {
            await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [randomUUID(), tenantId, name]);
        }
        const bot = await createVoiceBot(user, { name: "Sessions smoke bot", config: { languages: ["hi", "en"], ai: "claude-haiku" } });
        await addVoiceBotField(user, bot.id, { label: "Preferred intake", type: "DROPDOWN", options: ["January 2027", "July 2027"], question: "Which intake?" });
        const lead = await createLeadForTenant(user, { name: "Asha Rao", phone: "9876543210", source: "Website" } as any);

        // ---- Refused, in plain words, until everything is there ---------------------------------------
        delete process.env.VOICE_BOT_SERVICE_URL;
        process.env.VOICE_BOT_SERVICE_SECRET = SECRET;
        resetVoiceBotHealthCache();
        await rejects(() => createTestSession(user, bot.id, {}), "VOICE_BOT_SERVICE_NOT_SET_UP", "no service address");
        check((await getVoiceBot(user, bot.id))!.readiness.some((issue) => issue.tab === "service" && issue.message.includes("isn't set up")), "readiness says the service isn't set up");
        process.env.VOICE_BOT_SERVICE_URL = `http://127.0.0.1:${servicePort}`;
        process.env.VOICE_BOT_PUBLIC_URL = "ws://localhost:8765/voice-bot";
        resetVoiceBotHealthCache();
        check(!(await getVoiceBot(user, bot.id))!.readiness.some((issue) => issue.tab === "service"), "with the service answering, readiness has no service item");
        await rejects(() => createTestSession(user, bot.id, {}), "VOICE_BOT_TEST_NEEDS_GROQ", "no Groq key");
        await saveVoiceProviderSettings(tenantId, userId, { groqKey: "gsk_smoke_groq_key_123", claudeKey: "sk-ant-smoke-claude-key" });
        await rejects(() => createTestSession(user, bot.id, {}), "VOICE_BOT_TEST_NEEDS_OPENING", "no opening line");
        await updateVoiceBot(user, bot.id, { config: { openingLine: "Namaste {{lead.firstName|ji}}!", closingLine: "Dhanyavaad!", callerDetails: ["lead.firstName", "lead.source"] } });
        await rejects(() => createTestSession(user, bot.id, {}), "VOICE_BOT_TEST_NEEDS_VOICES", "no voices chosen");
        await updateVoiceBot(user, bot.id, { config: { voices: { hi: { provider: "google", voice: "hi-IN-Chirp3-HD-Aoede" }, en: { provider: "google", voice: "en-IN-Chirp3-HD-Aoede" } } } });
        await rejects(() => createTestSession(user, bot.id, {}), "VOICE_BOT_TEST_NEEDS_VOICE_KEY", "no voice key");
        await saveVoiceProviderSettings(tenantId, userId, { googleKey: "AIza-smoke-google-key" });

        // ---- Starting a test call -------------------------------------------------------------------------
        const first = await createTestSession(user, bot.id, { leadId: lead.id });
        check(first.url.startsWith(`ws://localhost:8765/voice-bot/test/${first.sessionId}.`), "the browser gets the service address with a token for this session");
        equal([first.sampleRate, first.ai, first.voicePaid, first.record.leadName], [24000, "Claude Haiku 5.5", false, "Asha Rao"], "the AI, voice rate and caller are reported");
        const row = (await q(`select status, kind, "startedBy", "leadId", snapshot from "VoiceBotSession" where id = $1`, [first.sessionId])).rows[0];
        equal([row.status, row.kind, row.startedBy, row.leadId], ["PENDING", "TEST", userId, lead.id], "the session waits to be claimed");
        equal([row.snapshot.openingLine, row.snapshot.caller.details], ["Namaste Asha!", { "lead.firstName": "Asha", "lead.source": "Website" }], "lines are filled from the lead, with only the ticked details");
        check(!/gsk_smoke|sk-ant-smoke|AIza-smoke/.test(JSON.stringify(row.snapshot)), "no key is stored with the session");
        const recorded = googleCalls;
        check(recorded >= 14, "the fixed lines are recorded in advance (opening, closing, fillers, check-ins, hand-over)");
        const characters = Number((await q(`select coalesce(sum(characters), 0) as c from "VoiceProviderUsage" where "tenantId" = $1 and provider = 'google'`, [tenantId])).rows[0].c);
        check(characters > 100, "their characters count against Google's free amount");
        await createTestSession(user, bot.id, { leadId: lead.id });
        equal(googleCalls, recorded, "a second test call reuses the recordings, at no cost");

        // ---- The service claims it -----------------------------------------------------------------------
        const token = first.url.split("/").pop()!;
        equal(await claimVoiceBotSession(`${first.sessionId}.wrong-token-value-xxxxxxxxxx`), null, "a wrong token is refused");
        const claim = await claimVoiceBotSession(token);
        check(claim && claim.sessionId === first.sessionId && claim.kind === "TEST", "the right token claims it");
        equal([claim!.keys.groq, claim!.keys.claude, claim!.keys.google, claim!.keys.azure], ["gsk_smoke_groq_key_123", "sk-ant-smoke-claude-key", "AIza-smoke-google-key", null], "and gets this conversation's keys");
        equal(Buffer.from(claim!.audio.opening, "base64").length, 4800, "and the opening, recorded (samples only, no WAV header)");
        equal(claim!.bot.ai.primary.value, "claude-haiku", "with the AI and its fallback");
        equal(claim!.bot.ai.fallback?.value, "groq-20b", "falling back to Groq");
        equal(await claimVoiceBotSession(token), null, "a token works once");
        const expired = await createTestSession(user, bot.id, {});
        await q(`update "VoiceBotSession" set "expiresAt" = now() - interval '1 second' where id = $1`, [expired.sessionId]);
        equal(await claimVoiceBotSession(expired.url.split("/").pop()!), null, "an expired token is refused");

        // ---- Signed internal route ---------------------------------------------------------------------------
        const fresh = await createTestSession(user, bot.id, {});
        const body = JSON.stringify({ token: fresh.url.split("/").pop() });
        const path = "/api/internal/voice-bot/sessions/claim";
        const unsigned = await claimRoute(new Request(`http://localhost${path}`, { method: "POST", body }));
        equal(unsigned.status, 404, "an unsigned claim gets 404");
        const forged = await claimRoute(new Request(`http://localhost${path}`, { method: "POST", body, headers: { "x-voice-bot-signature": signVoiceBotRequest("not-the-secret-0123456789abcdef0123", "POST", path, body) } }));
        equal(forged.status, 404, "a claim signed with another secret gets 404");
        const signed = await claimRoute(new Request(`http://localhost${path}`, { method: "POST", body, headers: { "x-voice-bot-signature": signVoiceBotRequest(SECRET, "POST", path, body) } }));
        equal(signed.status, 200, "a signed claim works");

        // ---- Usage during the conversation ---------------------------------------------------------------------
        const usage = await recordVoiceBotSessionUsage(first.sessionId, { provider: "claude", model: "claude-haiku-5-5", inputTokens: 500, outputTokens: 80, cacheReadTokens: 2000 });
        equal(usage, { claudeCapReached: false }, "Claude usage is taken, and the budget isn't reached");
        await recordVoiceBotSessionUsage(first.sessionId, { provider: "groq", audioSeconds: 12.5, requests: 4 });
        const byProvider = Object.fromEntries((await q(`select provider, sum("costMicroUsd")::int as cost, sum("audioSeconds")::float as seconds from "VoiceProviderUsage" where "tenantId" = $1 group by provider`, [tenantId])).rows.map((item) => [item.provider, [item.cost, item.seconds]]));
        equal(byProvider.claude, [110, 0], "Claude's cost is counted at Haiku prices (cache reads included)");
        equal(byProvider.groq, [0, 12.5], "Whisper seconds are counted");
        await assert.rejects(() => recordVoiceBotSessionUsage(first.sessionId, { provider: "openai" }));
        checks++;

        // ---- The end report ---------------------------------------------------------------------------------------
        const report = {
            outcome: "interested", durationSeconds: 63,
            transcript: [{ role: "bot", text: "Namaste Asha!", language: "hi", at: 0.1 }, { role: "caller", text: "January wala batch", language: "hi", at: 3.2 }],
            turns: [{ replyMs: 820, ai: "Claude Haiku 5.5", language: "hi" }],
            events: [{ type: "field_saved", at: 4, detail: { key: "preferred_intake" } }],
            fields: { preferred_intake: "January 2027", not_a_field: "dropped" },
        };
        equal(await endVoiceBotSession(first.sessionId, report), { ok: true, tenantId, voiceBotCallId: null }, "the report is taken (a test call has no phone call to process)");
        equal(await endVoiceBotSession(first.sessionId, { ...report, outcome: "other" }), { ok: true, alreadyEnded: true, tenantId, voiceBotCallId: null }, "a repeat changes nothing");
        const result = await getVoiceBotSession(user, bot.id, first.sessionId);
        equal([result.status, result.outcome, result.durationSeconds, result.transcript.length], ["ENDED", "interested", 63, 2], "the conversation is stored");
        equal(result.fields, [{ key: "preferred_intake", label: "Preferred intake", value: "January 2027" }], "with only the bot's own fields, labelled");
        equal(await recordVoiceBotSessionUsage(first.sessionId, { provider: "groq", requests: 1 }), null, "an ended conversation takes no more usage");
        const unclaimed = await createTestSession(user, bot.id, {});
        equal(await endVoiceBotSession(unclaimed.sessionId, report), { ok: true, alreadyEnded: true, tenantId, voiceBotCallId: null }, "a session that was never claimed can't be reported on");

        // ---- Voice after the free amounts (decision 33) ---------------------------------------------------------------
        const month = new Date().toISOString().slice(0, 7);
        await q(`insert into "VoiceProviderUsage" (id, "tenantId", provider, month, "botId", characters) values ($1, $2, 'google', $3, 'smoke-filler', $4)`, [randomUUID(), tenantId, month, FREE_VOICE_CHARACTERS.google]);
        const paid = await createTestSession(user, bot.id, {});
        equal(paid.voicePaid, true, "with Google's free amount used and no Azure key, Google is used at the paid rate");
        await createTestSession(user, bot.id, {});
        equal(Number((await q(`select count(*) from "VoiceProviderAlert" where "tenantId" = $1 and provider = 'google-paid'`, [tenantId])).rows[0].count), 1, "admins are alerted once a month");
        equal(Number((await q(`select count(*) from "Notification" where "tenantId" = $1 and title = 'Voice bots now use paid voice'`, [tenantId])).rows[0].count), 1, "with one notification");
        await saveVoiceProviderSettings(tenantId, userId, { azureKey: "azure-smoke-key-0123456789", azureRegion: "centralindia" });
        const azure = await createTestSession(user, bot.id, {});
        const azureSnapshot = (await q(`select snapshot from "VoiceBotSession" where id = $1`, [azure.sessionId])).rows[0].snapshot;
        equal([azure.voicePaid, azureSnapshot.voiceProvider, azureSnapshot.voices.hi.voice], [false, "azure", "hi-IN-SwaraNeural"], "with an Azure key, the call moves to Azure's free amount, in a same-gender voice");
        check(azureCalls > 0, "and its lines are recorded with Azure");

        // ---- Housekeeping ---------------------------------------------------------------------------------------------
        const stalePending = await createTestSession(user, bot.id, {});
        await q(`update "VoiceBotSession" set "expiresAt" = now() - interval '1 minute' where id = $1`, [stalePending.sessionId]);
        const staleActive = await createTestSession(user, bot.id, {});
        await claimVoiceBotSession(staleActive.url.split("/").pop()!);
        await q(`update "VoiceBotSession" set "claimedAt" = now() - interval '2 hours' where id = $1`, [staleActive.sessionId]);
        for (const statement of VOICE_BOT_SESSION_CLOSING) await executeAsSystem(statement, []);
        const statuses = Object.fromEntries((await q(`select id, status from "VoiceBotSession" where id = any($1)`, [[stalePending.sessionId, staleActive.sessionId]])).rows.map((item) => [item.id, item.status]));
        equal([statuses[stalePending.sessionId], statuses[staleActive.sessionId]], ["EXPIRED", "FAILED"], "housekeeping expires unclaimed tokens and closes conversations never reported");
    } finally {
        globalThis.fetch = realFetch;
        health.close();
        for (const [key, value] of [["VOICE_BOT_SERVICE_URL", savedEnv.url], ["VOICE_BOT_SERVICE_SECRET", savedEnv.secret], ["VOICE_BOT_PUBLIC_URL", savedEnv.public]] as const) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(resolveLocalStoragePath(`voice-bot-cache/${tenantId}`), { recursive: true, force: true });
        const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
        for (let pass = 0; pass < 6; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
        await q(`delete from "Tenant" where id = $1`, [tenantId]);
    }
    console.log(`Voice bot sessions smoke: ${checks} checks passed`);
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
