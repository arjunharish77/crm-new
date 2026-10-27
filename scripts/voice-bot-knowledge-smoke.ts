/**
 * Local-only real-database check for voice bot plan wave D (2026-10-27), a bot's knowledge:
 *   - written Q&A are ready at once; editing reads them again;
 *   - web pages: unsafe and unknown addresses are refused, every redirect is checked, failures
 *     are kept on the source in plain words, and a daily refresh keeps unchanged text's passages;
 *   - documents are stored privately, read by the bot service, and removed with their source;
 *   - catalogue programs become plain sentences (courses, intakes, fees, scholarships, eligibility);
 *   - "tidy with Claude" replaces the text with Claude's facts and counts the cost;
 *   - "test a question" finds the closest passage; each call is handed the bot's passages;
 *   - without the bot service, sources fail with a clear reason.
 * The bot service is a stand-in that checks every signature (set VOICE_BOT_SMOKE_SERVICE_URL and
 * VOICE_BOT_SMOKE_SECRET to use a running real one). Web pages and Claude are stood in for too.
 * A temporary tenant, removed afterwards. Run: tsx scripts/voice-bot-knowledge-smoke.ts
 */
import { createRequire } from "module";
import { createHash, randomUUID } from "crypto";
import { createServer, type IncomingMessage } from "http";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import assert from "node:assert/strict";
import { getPool } from "../src/lib/db/pool";
import { createVoiceBot, updateVoiceBot } from "../src/lib/server/voice-bots";
import {
    KNOWLEDGE_LIMITS, addDocument, addQa, addWebsite, deleteKnowledgeSource, getKnowledgeSource, knowledgeForCall, listKnowledge, processKnowledgeSource,
    refreshDueKnowledge, setCatalogPrograms, testKnowledgeQuestion, updateQa,
} from "../src/lib/server/voice-bot-knowledge";
import { claimVoiceBotSession, createTestSession } from "../src/lib/server/voice-bot-sessions";
import { resetVoiceBotHealthCache, verifyVoiceBotSignature } from "../src/lib/server/voice-bot-service";
import { saveVoiceProviderSettings } from "../src/lib/server/voice-providers";
import { resolveLocalStoragePath } from "../src/lib/storage/file-storage";

const require = createRequire(import.meta.url);
const d = require("./db-utils.js");
const SECRET = process.env.VOICE_BOT_SMOKE_SECRET || "smoke-secret-0123456789abcdef0123456789abcdef";

// Stand-in vectors: words hashed into 384 slots, so passages sharing words with a question are
// closer, on a shared baseline so scores sit in the range e5's do (about 0.75 to 0.95).
function standInVector(text: string) {
    const vector = new Float32Array(384);
    vector[0] = 4;
    for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
        if (word.length < 3) continue;
        const slot = 1 + (createHash("md5").update(word).digest().readUInt16LE(0) % 383);
        vector[slot] += 1;
    }
    const norm = Math.hypot(...vector) || 1;
    return Buffer.from(vector.map((value) => value / norm).buffer).toString("base64");
}

async function readBody(request: IncomingMessage) {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
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
    const source = async (tenantId: string, id: string) => (await q(`select * from "VoiceBotKnowledgeSource" where "tenantId" = $1 and id = $2`, [tenantId, id])).rows[0];

    // ---- Stand-in bot service ---------------------------------------------------------------------
    let badSignatures = 0;
    const service = createServer(async (request, response) => {
        const body = await readBody(request);
        if (request.url === "/health") return void response.writeHead(200).end("{}"); // the readiness check: unsigned by design
        if (!verifyVoiceBotSignature(SECRET, String(request.headers["x-voice-bot-signature"] ?? ""), "POST", request.url ?? "", body)) {
            badSignatures++;
            response.writeHead(404).end("{}");
            return;
        }
        const payload = JSON.parse(body);
        const reply = (status: number, value: unknown) => response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(value));
        if (request.url === "/internal/knowledge/document") {
            if (payload.fileType !== "text") return reply(422, { message: "The file couldn't be read. Is it a valid PDF, Word or text file?" });
            return reply(200, { text: Buffer.from(payload.data, "base64").toString("utf8") });
        }
        if (request.url === "/internal/knowledge/page") {
            const html = String(payload.html);
            return reply(200, { title: /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "", text: html.replace(/<(script|nav)[\s\S]*?<\/\1>/gi, "").replace(/<title>[^<]*<\/title>/i, "").replace(/<[^>]+>/g, "\n").replace(/\n{2,}/g, "\n\n").trim() });
        }
        if (request.url === "/internal/knowledge/prepare") {
            const parts = payload.whole ? [payload.text] : String(payload.text).split(/\n\s*\n/).map((part: string) => part.trim()).filter(Boolean);
            return reply(200, { passages: parts.map((text: string) => ({ text, language: /[ऀ-ॿ]/.test(text) ? "hi" : "en", embedding: standInVector(text) })), dimensions: 384 });
        }
        if (request.url === "/internal/knowledge/query") return reply(200, { embedding: standInVector(payload.question) });
        reply(404, {});
    });
    const health = createServer((_request, response) => response.writeHead(200).end("{}"));
    await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", () => resolve()));
    await new Promise<void>((resolve) => health.listen(0, "127.0.0.1", () => resolve()));
    const realService = process.env.VOICE_BOT_SMOKE_SERVICE_URL;
    const saved = { url: process.env.VOICE_BOT_SERVICE_URL, secret: process.env.VOICE_BOT_SERVICE_SECRET, public: process.env.VOICE_BOT_PUBLIC_URL };
    process.env.VOICE_BOT_SERVICE_URL = realService || `http://127.0.0.1:${(service.address() as any).port}`;
    process.env.VOICE_BOT_SERVICE_SECRET = SECRET;
    process.env.VOICE_BOT_PUBLIC_URL = "ws://localhost:8765/voice-bot";

    // ---- Stand-in web pages and Claude ----------------------------------------------------------------
    const realFetch = globalThis.fetch;
    const pages: Record<string, { status: number; type?: string; body?: string; location?: string }> = {};
    let claudeCalls = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
        const url = String(input instanceof Request ? input.url : input);
        if (pages[url]) {
            const page = pages[url];
            const headers: Record<string, string> = { "content-type": page.type ?? "text/html; charset=utf-8" };
            if (page.location) headers.location = page.location;
            return new Response(page.body ?? "", { status: page.status, headers });
        }
        if (url === "https://api.anthropic.com/v1/messages") {
            claudeCalls++;
            return new Response(JSON.stringify({
                content: [{ type: "tool_use", name: "knowledge_facts", input: { facts: [{ topic: "Hostel", fact: "Hostel rooms cost ₹60,000 a year including meals." }, { topic: "Scholarship", fact: "Students above 85% get 20% off the fee." }] } }],
                stop_reason: "tool_use",
                usage: { input_tokens: 1200, output_tokens: 90 },
            }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.startsWith("https://texttospeech.googleapis.com/")) {
            return new Response(JSON.stringify({ audioContent: Buffer.alloc(4800).toString("base64") }), { status: 200 });
        }
        return realFetch(input, init);
    }) as typeof fetch;

    const tenantId = randomUUID();
    try {
        await q(`insert into "Tenant" (id, name, "updatedAt") values ($1, 'Voice bot knowledge smoke', now())`, [tenantId]);
        await q(`insert into "TenantConfig" (id, "tenantId", "featureFlags") values ($1, $2, $3)`, [randomUUID(), tenantId, {}]);
        const roleId = randomUUID();
        await q(`insert into "Role" (id, "tenantId", name, permissions, "updatedAt") values ($1, $2, 'Smoke admin', $3, now())`, [roleId, tenantId, { recordAccess: "ALL", modules: { admin: "full" } }]);
        const userId = randomUUID();
        await q(`insert into "User" (id, "tenantId", email, name, password, "roleId", "updatedAt") values ($1, $2, $3, 'Priya Sharma', 'x', $4, now())`, [userId, tenantId, `vbk.${userId.slice(0, 8)}@smoke.invalid`, roleId]);
        const user = { id: userId, tenantId, isTenantAdmin: true, role: { permissions: { recordAccess: "ALL", modules: { admin: "full" } } } } as any;
        for (const name of ["lead", "opportunity", "activity"]) {
            await q(`insert into "ObjectDefinition" (id, "tenantId", name, label, "updatedAt") values ($1, $2, $3, $3, now())`, [randomUUID(), tenantId, name]);
        }
        const bot = await createVoiceBot(user, { name: "Knowledge smoke bot" });

        const empty = await listKnowledge(user, bot.id);
        equal([empty.sources.length, empty.passages, empty.catalogAvailable, empty.claudeAvailable], [0, 0, true, false], "a new bot has no knowledge; the catalogue is available");

        // ---- Q&A -------------------------------------------------------------------------------------------
        const qaId = await addQa(user, bot.id, { question: "Is there a hostel?", answer: "Yes, hostel rooms cost ₹60,000 a year including meals." });
        let qa = await source(tenantId, qaId);
        equal([qa.status, qa.chunkCount], ["READY", 1], "a Q&A is ready at once, as one passage");
        const chunk = (await q(`select text, language, array_length(embedding, 1) as dims from "VoiceBotKnowledgeChunk" where "sourceId" = $1`, [qaId])).rows[0];
        equal([chunk.text.startsWith("Q: Is there a hostel?\nA: Yes"), chunk.language, chunk.dims], [true, "en", 384], "with its language and a 384-number vector");
        await rejects(() => addQa(user, bot.id, { question: "Hi", answer: "" }), "VOICE_BOT_KNOWLEDGE_QA_INVALID", "a Q&A needs a question and an answer");
        await updateQa(user, bot.id, qaId, { question: "Is there a hostel on campus?", answer: "Yes. Hostel rooms cost ₹65,000 a year including meals." });
        qa = await source(tenantId, qaId);
        check(qa.status === "READY" && qa.content.includes("₹65,000"), "editing a Q&A reads it again");

        // ---- Web pages -------------------------------------------------------------------------------------
        await rejects(() => addWebsite(user, bot.id, { url: "http://127.0.0.1/admin" }), "VOICE_BOT_KNOWLEDGE_URL_UNSAFE", "a private address is refused");
        await rejects(() => addWebsite(user, bot.id, { url: "http://localhost.localdomain/admin" }), "VOICE_BOT_KNOWLEDGE_URL_UNSAFE", "a local host name is refused");
        await rejects(() => addWebsite(user, bot.id, { url: "no-such-site.invalid" }), "VOICE_BOT_KNOWLEDGE_URL_NOT_FOUND", "an unknown site is reported as not found");
        await rejects(() => addWebsite(user, bot.id, { url: "not a url" }), "VOICE_BOT_KNOWLEDGE_URL_INVALID", "a malformed address is refused");
        pages["https://example.com/mba/fees"] = { status: 200, body: "<html><head><title>MBA fees</title><script>track()</script></head><body><nav>Home</nav><h1>MBA fees</h1><p>The MBA tuition fee is ₹2,50,000 a year.</p><p>Fees can be paid in two instalments.</p></body></html>" };
        const pageId = await addWebsite(user, bot.id, { url: "example.com/mba/fees" });
        equal((await source(tenantId, pageId)).status, "PROCESSING", "a web page is added, to be read after the request");
        await processKnowledgeSource(tenantId, pageId);
        let page = await source(tenantId, pageId);
        check(page.status === "READY" && page.title === "MBA fees" && page.content.includes("₹2,50,000") && !page.content.includes("track()"), "the page is read: its title and text, without scripts");
        const pagePassages = (await q(`select id from "VoiceBotKnowledgeChunk" where "sourceId" = $1 order by position`, [pageId])).rows.map((row) => row.id);
        check(pagePassages.length >= 1, "and split into passages");

        await q(`update "VoiceBotKnowledgeSource" set "refreshedAt" = now() - interval '2 days' where id = $1`, [pageId]);
        await refreshDueKnowledge(10);
        const after = (await q(`select id from "VoiceBotKnowledgeChunk" where "sourceId" = $1 order by position`, [pageId])).rows.map((row) => row.id);
        equal(after, pagePassages, "the daily refresh keeps an unchanged page's passages");
        pages["https://example.com/mba/fees"].body = pages["https://example.com/mba/fees"].body!.replace("₹2,50,000", "₹2,75,000");
        await q(`update "VoiceBotKnowledgeSource" set "refreshedAt" = now() - interval '2 days' where id = $1`, [pageId]);
        await refreshDueKnowledge(10);
        page = await source(tenantId, pageId);
        check(page.content.includes("₹2,75,000"), "and picks up a changed one");

        pages["https://example.com/old"] = { status: 301, location: "http://169.254.169.254/latest/meta-data" };
        const redirected = await addWebsite(user, bot.id, { url: "https://example.com/old" });
        await processKnowledgeSource(tenantId, redirected);
        const redirectedRow = await source(tenantId, redirected);
        equal([redirectedRow.status, redirectedRow.error], ["FAILED", "That address can't be fetched: it isn't a public website."], "a redirect to a private address is stopped");
        pages["https://example.com/gone"] = { status: 404 };
        const gone = await addWebsite(user, bot.id, { url: "https://example.com/gone" });
        await processKnowledgeSource(tenantId, gone);
        equal((await source(tenantId, gone)).error, "The page answered 404.", "a missing page fails in plain words");
        pages["https://example.com/brochure.zip"] = { status: 200, type: "application/zip", body: "PK" };
        const zip = await addWebsite(user, bot.id, { url: "https://example.com/brochure.zip" });
        await processKnowledgeSource(tenantId, zip);
        equal((await source(tenantId, zip)).error, "The address isn't a web page or text.", "a non-page address fails in plain words");

        // ---- Documents -------------------------------------------------------------------------------------
        const docId = await addDocument(user, bot.id, { name: "Prospectus 2027.txt", type: "text/plain", bytes: Buffer.from("Placements\n\nOver 120 companies visited last year.\n\nThe average package was ₹8 lakh.") }, false);
        await processKnowledgeSource(tenantId, docId);
        const doc = await source(tenantId, docId);
        check(doc.status === "READY" && doc.chunkCount >= 1 && doc.content.includes("₹8 lakh") && doc.fileType === "text", "a text document is read into passages");
        check(existsSync(resolveLocalStoragePath(doc.fileKey)), "the file is kept privately");
        await rejects(() => addDocument(user, bot.id, { name: "setup.exe", type: "application/x-msdownload", bytes: Buffer.from("MZ") }, false), "VOICE_BOT_KNOWLEDGE_FILE_TYPE", "other file types are refused");
        await rejects(() => addDocument(user, bot.id, { name: "big.pdf", type: "application/pdf", bytes: Buffer.alloc(KNOWLEDGE_LIMITS.documentBytes + 1) }, false), "VOICE_BOT_KNOWLEDGE_FILE_SIZE", "files over 10 MB are refused");
        if (!realService) {
            const pdf = await addDocument(user, bot.id, { name: "scan.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4 not really") }, false);
            await processKnowledgeSource(tenantId, pdf);
            equal((await source(tenantId, pdf)).error, "The file couldn't be read. Is it a valid PDF, Word or text file?", "the service's reason is kept when a file can't be read");
            await deleteKnowledgeSource(user, bot.id, pdf);
        }
        const docFile = resolveLocalStoragePath(doc.fileKey);
        await deleteKnowledgeSource(user, bot.id, docId);
        check(!existsSync(docFile), "removing a document removes its file");
        equal(Number((await q(`select count(*) from "VoiceBotKnowledgeChunk" where "sourceId" = $1`, [docId])).rows[0].count), 0, "and its passages");

        // ---- Catalogue -------------------------------------------------------------------------------------
        const ids = { catalog: randomUUID(), university: randomUUID(), program: randomUUID(), course: randomUUID(), intake: randomUUID() };
        await q(`insert into "ProductCatalog" (id, "tenantId", name) values ($1, $2, 'Main')`, [ids.catalog, tenantId]);
        await q(`insert into "University" (id, "tenantId", "catalogId", name, city) values ($1, $2, $3, 'Test University', 'Bengaluru')`, [ids.university, tenantId, ids.catalog]);
        await q(`insert into "Program" (id, "tenantId", "universityId", name, level, "durationMonths", description) values ($1, $2, $3, 'MBA', 'POSTGRADUATE', 24, 'A two-year full-time MBA.')`, [ids.program, tenantId, ids.university]);
        await q(`insert into "Course" (id, "tenantId", "programId", name) values ($1, $2, $3, 'Business Analytics')`, [ids.course, tenantId, ids.program]);
        await q(`insert into "Specialization" (id, "tenantId", "courseId", name) values ($1, $2, $3, 'Marketing analytics')`, [randomUUID(), tenantId, ids.course]);
        await q(`insert into "Intake" (id, "tenantId", "programId", name, "startDate", "applicationDeadline") values ($1, $2, $3, 'January 2027', '2027-01-11', '2026-12-15')`, [ids.intake, tenantId, ids.program]);
        await q(`insert into "FeePlan" (id, "tenantId", "programId", "intakeId", name, "applicationFee", "tuitionFeeTotal", "otherFees") values ($1, $2, $3, $4, 'Standard', 1000, 500000, $5)`, [randomUUID(), tenantId, ids.program, ids.intake, JSON.stringify([{ label: "Hostel", amount: 60000 }])]);
        await q(`insert into "ScholarshipRule" (id, "tenantId", "programId", name, "discountType", "discountValue") values ($1, $2, $3, 'Merit', 'PERCENTAGE', 20)`, [randomUUID(), tenantId, ids.program]);
        await q(`insert into "EligibilityRule" (id, "tenantId", "programId", name, "minPercentage") values ($1, $2, $3, 'Graduation', 50)`, [randomUUID(), tenantId, ids.program]);
        const catalogId = await setCatalogPrograms(user, bot.id, [ids.program, "not-a-program"]);
        await processKnowledgeSource(tenantId, catalogId!);
        const catalog = await source(tenantId, catalogId!);
        equal(catalog.programIds, [ids.program], "only real programs are kept");
        for (const expected of ["MBA (Test University): a postgraduate program of 24 months at Test University, Bengaluru.", "courses: Business Analytics (specialisations: Marketing analytics)", "January 2027, starts 11 January 2027, apply by 15 December 2026", "total tuition ₹5,00,000, application fee ₹1,000, hostel ₹60,000", "Merit (20% off)", "at least 50% marks"]) {
            check(catalog.content.includes(expected), `the catalogue reads: "${expected}"`);
        }
        equal(await setCatalogPrograms(user, bot.id, [ids.program]), catalogId, "a bot has one catalogue source");
        await setCatalogPrograms(user, bot.id, []);
        equal(await source(tenantId, catalogId!), undefined, "ticking no programs removes it");

        // ---- Tidy with Claude ----------------------------------------------------------------------------------
        await saveVoiceProviderSettings(tenantId, userId, { claudeKey: "sk-ant-knowledge-smoke" });
        pages["https://example.com/campus"] = { status: 200, body: "<html><title>Campus life</title><body><p>Our wonderful campus!!! Hostel: 60000/yr incl. meals. छात्रवृत्ति 85% से ऊपर 20%.</p></body></html>" };
        const tidyId = await addWebsite(user, bot.id, { url: "https://example.com/campus", tidyWithClaude: true });
        await processKnowledgeSource(tenantId, tidyId);
        const tidy = await source(tenantId, tidyId);
        equal(tidy.content, "Hostel: Hostel rooms cost ₹60,000 a year including meals.\n\nScholarship: Students above 85% get 20% off the fee.", "with tidying on, the text is Claude's facts");
        check(claudeCalls === 1 && Number((await q(`select sum("costMicroUsd") as c from "VoiceProviderUsage" where "tenantId" = $1 and provider = 'claude'`, [tenantId])).rows[0].c) > 0, "and the cost counts against the Claude budget");

        // ---- Using the knowledge ---------------------------------------------------------------------------------
        const found = await testKnowledgeQuestion(user, bot.id, "hostel rooms meals");
        check(found.passages.length >= 1 && ["Is there a hostel on campus?", "Campus life"].includes(found.passages[0].source), "a test question finds the hostel passage");
        await rejects(() => testKnowledgeQuestion(user, bot.id, " "), "VOICE_BOT_KNOWLEDGE_QUESTION_INVALID", "an empty question is refused");
        const forCall = await knowledgeForCall(tenantId, bot.id);
        const ready = Number((await q(`select count(*) from "VoiceBotKnowledgeChunk" c join "VoiceBotKnowledgeSource" s on s.id = c."sourceId" where c."botId" = $1 and s.status = 'READY'`, [bot.id])).rows[0].count);
        equal(forCall.length, ready, "a call gets every ready passage");
        check(forCall.every((item) => Buffer.from(item.embedding, "base64").length === 384 * 4 && item.source), "each with its source and vector");
        const listed = await listKnowledge(user, bot.id);
        equal(listed.passages, listed.sources.reduce((total: number, item: any) => total + item.chunkCount, 0), "the passage count adds up");
        const detail = await getKnowledgeSource(user, bot.id, qaId);
        equal(detail.passages.length, 1, "a source's passages can be viewed");

        // A test call carries them to the bot service.
        await saveVoiceProviderSettings(tenantId, userId, { groqKey: "gsk-knowledge-smoke", googleKey: "AIza-knowledge-smoke" });
        await updateVoiceBot(user, bot.id, { config: { openingLine: "Namaste!", voices: { hi: { provider: "google", voice: "hi-IN-Chirp3-HD-Aoede" }, en: { provider: "google", voice: "en-IN-Chirp3-HD-Aoede" } } } });
        process.env.VOICE_BOT_SERVICE_URL = `http://127.0.0.1:${(health.address() as any).port}`;
        resetVoiceBotHealthCache();
        const session = await createTestSession(user, bot.id, {});
        const claim = await claimVoiceBotSession(session.url.split("/").pop()!);
        equal(claim!.knowledge.length, ready, "the claimed call includes the bot's passages");

        // ---- Without the bot service --------------------------------------------------------------------------------
        process.env.VOICE_BOT_SERVICE_URL = "http://127.0.0.1:9";
        const offline = await addQa(user, bot.id, { question: "Is there parking?", answer: "Yes, free parking for students." });
        equal([(await source(tenantId, offline)).status, (await source(tenantId, offline)).error], ["FAILED", "The voice bot service isn't answering. Try again once it's running."], "without the service, a source fails with the reason");
        if (!realService) equal(badSignatures, 0, "every call to the service was correctly signed");
    } finally {
        globalThis.fetch = realFetch;
        service.close();
        health.close();
        for (const [key, value] of [["VOICE_BOT_SERVICE_URL", saved.url], ["VOICE_BOT_SERVICE_SECRET", saved.secret], ["VOICE_BOT_PUBLIC_URL", saved.public]] as const) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
        await rm(resolveLocalStoragePath(`voice-bot-knowledge/${tenantId}`), { recursive: true, force: true });
        await rm(resolveLocalStoragePath(`voice-bot-cache/${tenantId}`), { recursive: true, force: true });
        const tables = (await q(`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'tenantId'`)).rows.map((row) => row.table_name as string);
        for (let pass = 0; pass < 8; pass++) for (const table of tables) await q(`delete from "${table.replaceAll('"', '""')}" where "tenantId"::text = $1`, [tenantId]).catch(() => undefined);
        await q(`delete from "Tenant" where id = $1`, [tenantId]);
    }
    console.log(`Voice bot knowledge smoke: ${checks} checks passed`);
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => process.exit(process.exitCode ?? 0));
