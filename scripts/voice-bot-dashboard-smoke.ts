/**
 * Local-only real-database check for voice bot plan wave G (2026-10-27): the dashboard, the
 * report by bot, the call quality review, and use of the free limits with their alerts.
 *   - usage per meter and day (Groq chat per model, Whisper, the voices) from the bot service and
 *     the CRM's own calls; one admin alert at 80% of a free limit, per period;
 *   - the quality review: Claude's score and "worth a listen" saved with the call, Groq's when
 *     Claude isn't set up;
 *   - the dashboard: totals, answer rate, outcomes, calls per day, reply times per AI, calls to
 *     listen to, Claude spend per bot, the meters; one bot's view; "Call my phone" not counted;
 *   - Voice Bot Performance in Reports, with dates.
 * A temporary tenant, removed afterwards. Run: tsx scripts/voice-bot-dashboard-smoke.ts
 */
import { createRequire } from "module";
import { randomUUID } from "crypto";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createVoiceBot } from "../src/lib/server/voice-bots";
import { recordProviderUsage, saveVoiceProviderSettings, usageMeters } from "../src/lib/server/voice-providers";
import { recordVoiceBotSessionUsage } from "../src/lib/server/voice-bot-sessions";
import { processVoiceBotCall } from "../src/lib/server/voice-bot-calls";
import { voiceBotDashboard, voiceBotPerformanceReport } from "../src/lib/server/voice-bot-stats";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");

async function main() {
    for (const url of [d.directDatabaseUrl(), d.appDatabaseUrl()]) assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local database required");
    const pool = getPool();
    const q = (sql: string, args: unknown[] = []) => pool.query(sql, args);
    let checks = 0;
    const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
    const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };

    // Stand-in Claude and Groq for the after-call summary and review.
    const realFetch = globalThis.fetch;
    const review = { score: 2, issues: ["Said the fee was ₹1 lakh; the knowledge says ₹1.6 lakh."], listen: true, reason: "The bot gave a wrong fee." };
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url === "https://api.anthropic.com/v1/messages") {
            const body = JSON.parse(init.body);
            check(String(body.messages[0].content).includes("Goal: Book a counselling session."), "the review sees the bot's brief");
            return new Response(JSON.stringify({
                content: [{ type: "tool_use", name: "call_summary", input: { summary: "Asked about fees.", outcome: "interested", fields: {}, callbackAt: null, callerName: null, review } }],
                stop_reason: "tool_use", usage: { input_tokens: 1200, output_tokens: 150 },
            }), { status: 200 });
        }
        if (url === "https://api.groq.com/openai/v1/chat/completions") {
            return new Response(JSON.stringify({
                choices: [{ message: { content: JSON.stringify({ summary: "Wrong number.", outcome: "wrong_number", fields: {}, callbackAt: null, callerName: null, review: { score: 4, issues: [], listen: false, reason: "Ended politely." } }) } }],
                usage: { prompt_tokens: 900, completion_tokens: 100 },
            }), { status: 200 });
        }
        return realFetch(input, init);
    }) as typeof fetch;

    const tenantId = randomUUID();
    try {
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bot dashboard smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, { generalSettings: { timezone: "Asia/Kolkata" } }]);
        const adminRole = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [adminRole, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }]);
        const ownerId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Priya Owner', 'x', $4, now())`, [ownerId, tenantId, `owner.${ownerId.slice(0, 8)}@smoke.invalid`, adminRole]);
        const owner = { id: ownerId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        for (const name of ["lead", "opportunity", "activity"]) await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [randomUUID(), tenantId, name]);
        await saveVoiceProviderSettings(tenantId, ownerId, { groqKey: "gsk-dashboard-smoke", claudeKey: "sk-ant-dashboard-smoke" });
        const botA = await createVoiceBot(owner, { name: "Admissions", config: { goal: "Book a counselling session.", rules: "Never promise scholarships." } });
        const botB = await createVoiceBot(owner, { name: "Fees reminder" });

        // ---- Usage meters and free-limit alerts -------------------------------------------------------
        await recordProviderUsage(tenantId, "groq", { botId: botA.id, costMicroUsd: 0, inputTokens: 100_000, outputTokens: 50_000, requests: 100, kind: "chat", model: "openai/gpt-oss-20b" });
        equal(Number((await q(`select count(*) from "Notification" where "tenantId" = $1 and data->>'type' = 'VOICE_BOT_FREE_LIMIT'`, [tenantId])).rows[0].count), 0, "no alert below 80% (150k of 200k tokens is 75%)");
        await recordProviderUsage(tenantId, "groq", { botId: botA.id, costMicroUsd: 0, inputTokens: 10_000, outputTokens: 1_000, requests: 5, kind: "chat", model: "openai/gpt-oss-20b" });
        await recordProviderUsage(tenantId, "groq", { botId: botA.id, costMicroUsd: 0, inputTokens: 1_000, outputTokens: 100, requests: 1, kind: "chat", model: "openai/gpt-oss-20b" });
        const alerts = (await q(`select title, message, data from "Notification" where "tenantId" = $1 and data->>'type' = 'VOICE_BOT_FREE_LIMIT'`, [tenantId])).rows;
        check(alerts.length === 1 && alerts[0].title === "Groq gpt-oss-20b: over 80% of the free daily limit used" && alerts[0].message.includes("81%") && alerts[0].message.includes("switch to Claude"), "admins hear once when a Groq model reaches 80% of its free daily limit");
        const session = randomUUID();
        await q(`insert into "VoiceBotSession" (id, "tenantId", "botId", kind, status, "tokenHash", "expiresAt") values ($1, $2, $3, 'CALL', 'ACTIVE', 'x', now() + interval '1 hour')`, [session, tenantId, botA.id]);
        await recordVoiceBotSessionUsage(session, { provider: "groq", kind: "stt", audioSeconds: 24_000, requests: 40 });
        await recordVoiceBotSessionUsage(session, { provider: "google", kind: "tts", characters: 850_000, requests: 30 });
        const meters = await usageMeters(tenantId);
        const byMeter = Object.fromEntries(meters.meters.map((meter) => [meter.meter, meter.percent]));
        equal([byMeter["groq-chat:openai/gpt-oss-20b"], byMeter["groq-whisper"], byMeter["google-tts"], byMeter["azure-tts"]], [81, 83, 85, 0], "each meter shows its share of the free limit (tokens, audio seconds, characters)");
        const titles = (await q(`select title from "Notification" where "tenantId" = $1 and data->>'type' = 'VOICE_BOT_FREE_LIMIT' order by title`, [tenantId])).rows.map((row) => row.title);
        check(titles.includes("Google voice: over 80% of the free monthly limit used") && titles.includes("Groq Whisper (hearing callers): over 80% of the free daily limit used"), "and for Whisper's daily and Google's monthly free amounts");

        // ---- The quality review --------------------------------------------------------------------------
        const call = async (botId: string, fields: Record<string, unknown>) => {
            const id = randomUUID();
            await q(`insert into "VoiceBotCall" (id, "tenantId", "botId", "firstAttemptId", trigger, priority, status, phone, "dialedAt", "answeredAt", "durationSeconds", outcome, review, "sessionId", "createdAt")
                     values ($1, $2, $3, $1, $4, 3, $5, '+919800000000', $6, $7, $8, $9, $10, $11, coalesce($12, now()))`,
                [id, tenantId, botId, fields.trigger ?? "MANUAL", fields.status, fields.dialed === false ? null : new Date(), fields.answered ? new Date() : null, fields.duration ?? null,
                    fields.outcome ?? null, fields.review ? JSON.stringify(fields.review) : null, fields.sessionId ?? null, fields.createdAt ?? null]);
            return id;
        };
        const reviewedSession = randomUUID();
        await q(`insert into "VoiceBotSession" (id, "tenantId", "botId", kind, status, "tokenHash", "expiresAt", transcript, turns) values ($1, $2, $3, 'CALL', 'ENDED', 'x', now(), $4, $5)`, [reviewedSession, tenantId, botA.id,
            JSON.stringify([{ role: "bot", text: "Namaste!" }, { role: "caller", text: "MBA ki fees kitni hai?" }, { role: "bot", text: "Ek lakh rupaye." }]),
            JSON.stringify([{ replyMs: 700, sttMs: 200, llmMs: 300, ttsMs: 150, ai: "Groq · gpt-oss-20b" }, { replyMs: 900, ai: "Groq · gpt-oss-20b" }, { replyMs: 1500, ai: "Claude Haiku 5.5" }, { replyMs: 2100, ai: "Groq · gpt-oss-20b" }])]);
        const reviewed = await call(botA.id, { status: "COMPLETED", answered: true, duration: 120, sessionId: reviewedSession });
        await processVoiceBotCall(tenantId, reviewed);
        const saved = (await q(`select review, outcome from "VoiceBotCall" where id = $1`, [reviewed])).rows[0];
        equal(saved.review, { ...review, by: "claude" }, "Claude's review is saved with the call: score, issues, worth a listen");
        await saveVoiceProviderSettings(tenantId, ownerId, { remove: ["claude"] });
        const groqSession = randomUUID();
        await q(`insert into "VoiceBotSession" (id, "tenantId", "botId", kind, status, "tokenHash", "expiresAt", transcript) values ($1, $2, $3, 'CALL', 'ENDED', 'x', now(), $4)`, [groqSession, tenantId, botB.id,
            JSON.stringify([{ role: "bot", text: "Hello!" }, { role: "caller", text: "Wrong number." }])]);
        const groqReviewed = await call(botB.id, { status: "COMPLETED", answered: true, duration: 20, sessionId: groqSession });
        await processVoiceBotCall(tenantId, groqReviewed);
        equal((await q(`select review->>'by' as by, review->>'listen' as listen from "VoiceBotCall" where id = $1`, [groqReviewed])).rows[0], { by: "groq", listen: "false" }, "without Claude, Groq writes the review");

        // ---- The dashboard -------------------------------------------------------------------------------
        await call(botA.id, { status: "NO_ANSWER", outcome: "NO_ANSWER" });
        await call(botA.id, { status: "MACHINE", outcome: "MACHINE" });
        await call(botA.id, { status: "COMPLETED", answered: true, duration: 60, outcome: "callback", review: { score: 4, issues: [], listen: false, reason: "Fine." } });
        await call(botA.id, { status: "BLOCKED", dialed: false });
        await call(botA.id, { status: "COMPLETED", answered: true, duration: 90, outcome: "interested", trigger: "INBOUND" });
        await call(botA.id, { status: "COMPLETED", answered: true, duration: 30, outcome: "interested", trigger: "TEST_PHONE" });
        await call(botA.id, { status: "COMPLETED", answered: true, duration: 45, outcome: "interested", createdAt: new Date(Date.now() - 40 * 86_400_000) });
        await q(`insert into "VoiceProviderUsage" (id, "tenantId", provider, month, "botId", "costMicroUsd") values ($1, $2, 'claude', $3, $4, 1500000)`, [randomUUID(), tenantId, new Date().toISOString().slice(0, 7), botB.id]);

        const all = await voiceBotDashboard(owner, { days: 30 });
        equal({ placed: all.totals.placed, answered: all.totals.answered, rate: all.totals.answerRate, inbound: all.totals.inbound, notCalled: all.totals.notCalled, interested: all.totals.interested, callbacks: all.totals.callbacks, toListen: all.totals.toListen },
            { placed: 5, answered: 3, rate: 60, inbound: 1, notCalled: 1, interested: 2, callbacks: 1, toListen: 1 },
            "totals for the last 30 days: answered, not answered, a machine, incoming and not called; test calls and older calls left out");
        const a = all.bots.find((bot) => bot.botId === botA.id)!;
        const b = all.bots.find((bot) => bot.botId === botB.id)!;
        equal([a.placed, a.answered, a.answerRate, a.inbound, a.averageScore, a.toListen], [4, 2, 50, 1, 3, 1], "per bot, with the average quality score");
        check(b.claudeSpendUsd >= 1.5 && a.claudeSpendUsd > 0, "with this month's Claude spend per bot");
        const outcomes = all.outcomes.map((item) => [item.label, item.count] as [string, number]).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
        equal(outcomes, [["Interested", 2], ["Answering machine", 1], ["Callback booked", 1], ["No answer", 1], ["Wrong number", 1]], "what came of the calls");
        equal(all.daily.length, 30, "a bar for each of the 30 days");
        equal(all.daily[29].placed + all.daily[29].inbound, 6, "today's calls are on today's bar");
        const groq = all.replyTimes.find((row) => row.ai === "Groq · gpt-oss-20b")!;
        equal([groq.turns, groq.medianMs, groq.slowestMs, groq.sttMs], [3, 900, 2100, 200], "reply times per AI: replies, typical, slowest, and the hearing part");
        equal(all.toListen.map((item) => [item.botName, item.score]), [["Admissions", 2]], "the call to listen to");
        check(all.usage.meters.some((meter) => meter.name === "Groq gpt-oss-20b") && all.claude.capUsd === 160, "the meters and the Claude budget");

        const one = await voiceBotDashboard(owner, { days: 7, botId: botB.id });
        equal([one.bots.length, one.totals.placed, one.toListen.length], [1, 1, 0], "one bot's view");
        const ninety = await voiceBotDashboard(owner, { days: 90 });
        equal(ninety.totals.interested, 3, "90 days takes in the older call");

        // ---- Voice Bot Performance in Reports ------------------------------------------------------------
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const report = await voiceBotPerformanceReport(owner, { from: today, to: today, ownerIds: null, teamId: null });
        equal(report.rows.map((row) => [row.bot, row.callsPlaced, row.answerRatePercent, row.incoming, row.toListen]), [["Admissions", 4, 50, 1, 1], ["Fees reminder", 1, 100, 0, 0]], "the report has a row per bot for the dates");
        const earlier = await voiceBotPerformanceReport(owner, { from: "2020-01-01", to: "2020-01-31", ownerIds: null, teamId: null });
        equal(earlier.rows.map((row) => row.callsPlaced), [0, 0], "and nothing for dates without calls");
    } finally {
        globalThis.fetch = realFetch;
        const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
        for (let pass = 0; pass < 8; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
        await q(`delete from "Tenant" where id = $1`, [tenantId]);
    }
    console.log(`Voice bot dashboard smoke: ${checks} checks passed`);
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
