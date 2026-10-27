import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { z } from "zod";
import { execute, queryOne, queryOneAsSystem, executeAsSystem, query } from "@/lib/db/query";
import { VOICE_BOT_AI_OPTIONS, type FixedStep, type VoiceBotConfig } from "@/lib/voice-bot-config";
import { renderPlaceholders } from "@/lib/voice-bot-placeholders";
import { loadVoiceBotForSession, resolveCallerDetails } from "@/lib/server/voice-bots";
import { voiceBotPublicUrl, voiceBotServiceConfig, voiceBotServiceHealthy } from "@/lib/server/voice-bot-service";
import {
    alertPaidVoiceOnce, azureRegion, chooseCallVoices, claudeCapReached, claudeCostMicroUsd, providerKey, recordProviderUsage,
    synthesizePcm, voiceCharactersThisMonth, voiceGender,
} from "@/lib/server/voice-providers";
import { readPrivateFile, writePrivateFile } from "@/lib/storage/file-storage";
import { knowledgeForCall } from "@/lib/server/voice-bot-knowledge";
import { requireTenantId } from "@/lib/server/tenant-guard";

// Voice bot conversations (voice bot plan wave C). A session is one conversation with a bot: a
// browser test call now, a phone call from wave E. The CRM creates it with a single-use token;
// the bot service claims it when the audio connects and gets what the bot needs for that one
// conversation, including the provider keys, which are never stored with the session. When the
// conversation ends, the service reports the transcript, turn timings, fields and events.

type TenantUser = { id: string; tenantId: string | null; role?: any; permissionTemplates?: any; isTenantAdmin?: boolean; isPlatformAdmin?: boolean };
type Language = "hi" | "en";
type SampleRate = 8000 | 16000 | 24000;

const TEST_SAMPLE_RATE: SampleRate = 24000;
const PHONE_SAMPLE_RATE: SampleRate = 8000;
const CLAIM_WINDOW_MS = 2 * 60 * 1000;

// Lines every bot says the same way, per language. Hindi verbs agree with the voice's gender.
export function cannedLines(language: Language, gender: "female" | "male") {
    if (language === "hi") {
        const ing = gender === "female" ? "रही" : "रहा";
        return {
            fillers: ["हाँ जी।", "अच्छा।", "जी, एक सेकंड।"],
            checkIn: "हैलो, क्या आप मुझे सुन पा रहे हैं?",
            silenceGoodbye: "लगता है आवाज़ नहीं आ रही। हम आपको बाद में कॉल करेंगे। धन्यवाद!",
            timeUp: "माफ़ कीजिए, हमारा समय खत्म हो रहा है। हमारी टीम से कोई आपको जल्द ही कॉल करेगा। धन्यवाद!",
            problem: "माफ़ कीजिए, कुछ तकनीकी दिक्कत आ गई है। हमारी टीम आपको जल्द ही कॉल करेगी। धन्यवाद!",
            transfer: `एक पल रुकिए, मैं आपको हमारी टीम से जोड़ ${ing} हूँ।`,
            noOneFree: "माफ़ कीजिए, अभी हमारी टीम में कोई उपलब्ध नहीं है। हम आपको जल्द ही कॉल करेंगे। धन्यवाद!",
        };
    }
    return {
        fillers: ["Sure.", "Okay.", "Right, one moment."],
        checkIn: "Hello, can you hear me?",
        silenceGoodbye: "I can't hear you, so I'll let you go. We'll call you back later. Thank you!",
        timeUp: "I'm sorry, we're almost out of time. Someone from our team will call you soon. Thank you!",
        problem: "Sorry, something went wrong on our side. Our team will call you back soon. Thank you!",
        transfer: "One moment please, I'm connecting you to our team.",
        noOneFree: "Sorry, nobody from our team is free right now. We'll call you back soon. Thank you!",
    };
}

function tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function renderStep(step: FixedStep, values: Record<string, unknown>) {
    return { ...step, text: renderPlaceholders(step.text, values) };
}

// The AI that runs the conversation, and the one it falls back to (decision 28). Over the Claude
// budget, or without a Claude key, a Claude bot runs on Groq (decision 29).
function chooseAi(config: VoiceBotConfig, claude: { configured: boolean; capReached: boolean }) {
    const option = VOICE_BOT_AI_OPTIONS.find((item) => item.value === config.ai) ?? VOICE_BOT_AI_OPTIONS[2];
    const claudeUsable = claude.configured && !claude.capReached;
    const groqFor = (value: string) => (value === "claude-sonnet" ? VOICE_BOT_AI_OPTIONS[1] : VOICE_BOT_AI_OPTIONS[0]);
    const claudeFor = (value: string) => (value === "groq-120b" ? VOICE_BOT_AI_OPTIONS[3] : VOICE_BOT_AI_OPTIONS[2]);
    const primary = option.provider === "claude" && !claudeUsable ? groqFor(option.value) : option;
    const fallback = primary.provider === "claude" ? groqFor(primary.value) : claudeUsable ? claudeFor(primary.value) : null;
    const describe = (item: (typeof VOICE_BOT_AI_OPTIONS)[number]) => ({ value: item.value, provider: item.provider, model: item.model, label: item.label });
    return {
        primary: describe(primary),
        fallback: fallback ? describe(fallback) : null,
        note: primary.value !== option.value ? (claude.configured ? "This month's Claude budget is used up, so this conversation runs on Groq." : "No Claude key is saved, so this conversation runs on Groq.") : null,
    };
}

// Pre-recorded audio for a line, cached by voice and text so a repeated line costs nothing.
async function cachedLineAudio(tenantId: string, botId: string, voice: { provider: "google" | "azure"; voice: string }, language: Language, text: string, sampleRate: SampleRate) {
    const key = createHash("sha256").update(`${voice.provider}|${voice.voice}|${language}|${sampleRate}|${text}`).digest("hex");
    const path = `voice-bot-cache/${tenantId}/${key}.pcm`;
    try {
        return { key, path, bytes: (await readPrivateFile(path)).length };
    } catch {
        const pcm = await synthesizePcm(tenantId, { provider: voice.provider, voice: voice.voice, language, text, sampleRate, botId });
        await writePrivateFile(path, pcm, { contentType: "audio/L16" });
        return { key, path, bytes: pcm.length };
    }
}

export type SessionSnapshot = {
    botId: string; botName: string; kind: "TEST" | "CALL"; sampleRate: SampleRate;
    languages: Language[]; startLanguage: Language;
    voices: { hi: { provider: "google" | "azure"; voice: string }; en: { provider: "google" | "azure"; voice: string } };
    voiceProvider: "google" | "azure"; voicePaid: boolean; voiceGender: "female" | "male";
    ai: ReturnType<typeof chooseAi>;
    persona: string; goal: string; rules: string; endRule: string;
    openingLine: string; closingLine: string;
    fixedSteps: { before: FixedStep[]; after: FixedStep[] };
    transfer: { enabled: boolean; rule: string };
    fields: Array<{ key: string; label: string; type: string; options: string[]; question: string; mustAsk: boolean; confirm: boolean }>;
    caller: { details: Record<string, unknown>; record: { leadId: string | null; leadName: string | null; opportunityId: string | null; opportunityTitle: string | null } };
    maxCallMinutes: number; silenceSeconds: number;
    lines: Record<Language, ReturnType<typeof cannedLines>>;
    audio: Record<string, { path: string; text: string; language: Language }>;
};

type SessionTarget = { leadId?: string | null; opportunityId?: string | null };

// Everything a conversation needs, checked and recorded in advance: the caller details filled
// from the record, the AI and voice for this conversation, and the fixed lines recorded at the
// conversation's sample rate (browser 24 kHz, phone 8 kHz). `actor` is whose record access is used.
async function prepareSession(actor: TenantUser, botId: string, target: SessionTarget, options: { kind: "TEST" | "CALL"; sampleRate: SampleRate; claimWindowMs: number; voiceBotCallId?: string | null }) {
    const tenantId = requireTenantId(actor);
    const loaded = await loadVoiceBotForSession(tenantId, botId);
    if (!loaded) throw new Error("VOICE_BOT_NOT_FOUND");
    const { bot, fields } = loaded;
    const config = bot.config;
    if (!voiceBotServiceConfig().configured) throw new Error("VOICE_BOT_SERVICE_NOT_SET_UP");
    if (!(await voiceBotServiceHealthy())) throw new Error("VOICE_BOT_SERVICE_DOWN");
    if (!(await providerKey(tenantId, "groq"))) throw new Error("VOICE_BOT_TEST_NEEDS_GROQ");
    if (!config.openingLine.trim()) throw new Error("VOICE_BOT_TEST_NEEDS_OPENING");
    for (const language of config.languages) if (!config.voices[language]?.voice) throw new Error("VOICE_BOT_TEST_NEEDS_VOICES");

    const [google, azure, region, claude, capReached, used] = await Promise.all([
        providerKey(tenantId, "google"), providerKey(tenantId, "azure"), azureRegion(tenantId), providerKey(tenantId, "claude"), claudeCapReached(tenantId), voiceCharactersThisMonth(tenantId),
    ]);
    const choice = chooseCallVoices(config.voices, { google: !!google, azure: !!azure && !!region }, used);
    if (!choice) throw new Error("VOICE_BOT_TEST_NEEDS_VOICE_KEY");
    if (choice.paid) await alertPaidVoiceOnce(tenantId);

    const { values, record } = await resolveCallerDetails(actor, config, target);
    const gender = voiceGender(config.voices.hi.provider, config.voices.hi.voice || choice.voices.hi.voice);
    const lines = { hi: cannedLines("hi", gender), en: cannedLines("en", gender) };
    const snapshot: SessionSnapshot = {
        botId: bot.id, botName: bot.name, kind: options.kind, sampleRate: options.sampleRate,
        languages: config.languages, startLanguage: config.languages.includes(config.startLanguage) ? config.startLanguage : config.languages[0],
        voices: choice.voices, voiceProvider: choice.provider, voicePaid: choice.paid, voiceGender: gender,
        ai: chooseAi(config, { configured: !!claude, capReached }),
        persona: renderPlaceholders(config.persona, values), goal: renderPlaceholders(config.goal, values), rules: renderPlaceholders(config.rules, values),
        endRule: renderPlaceholders(config.endRule, values),
        openingLine: renderPlaceholders(config.openingLine, values), closingLine: renderPlaceholders(config.closingLine, values),
        fixedSteps: { before: config.fixedSteps.before.map((step) => renderStep(step, values)), after: config.fixedSteps.after.map((step) => renderStep(step, values)) },
        transfer: { enabled: config.transfer.enabled, rule: renderPlaceholders(config.transfer.rule, values) },
        fields: fields.map((field) => ({ key: field.key, label: field.label, type: field.type, options: field.options, question: field.question, mustAsk: field.mustAsk, confirm: field.confirm })),
        caller: { details: values, record },
        maxCallMinutes: config.maxCallMinutes, silenceSeconds: config.silenceSeconds,
        lines, audio: {},
    };

    // Lines said the same way every time are recorded now, so the bot starts speaking at once.
    const toRecord: Array<{ id: string; language: Language; text: string }> = [{ id: "opening", language: snapshot.startLanguage, text: snapshot.openingLine }];
    if (snapshot.closingLine.trim()) toRecord.push({ id: "closing", language: snapshot.startLanguage, text: snapshot.closingLine });
    for (const language of snapshot.languages) {
        const own = lines[language];
        own.fillers.forEach((text, index) => toRecord.push({ id: `filler.${language}.${index}`, language, text }));
        for (const name of ["checkIn", "silenceGoodbye", "timeUp", "problem", "transfer", "noOneFree"] as const) toRecord.push({ id: `${name}.${language}`, language, text: own[name] });
    }
    for (const step of [...snapshot.fixedSteps.before, ...snapshot.fixedSteps.after]) {
        if (step.text.trim()) toRecord.push({ id: `step.${step.id}`, language: snapshot.startLanguage, text: step.text });
    }
    try {
        for (const item of toRecord) {
            const result = await cachedLineAudio(tenantId, bot.id, snapshot.voices[item.language], item.language, item.text, options.sampleRate);
            snapshot.audio[item.id] = { path: result.path, text: item.text, language: item.language };
        }
    } catch (error) {
        if (error instanceof Error && error.message === "VOICE_PROVIDER_NOT_CONFIGURED") throw new Error("VOICE_BOT_TEST_NEEDS_VOICE_KEY");
        throw new Error("VOICE_BOT_TEST_VOICE_FAILED");
    }

    const id = randomUUID();
    const token = `${id}.${randomBytes(24).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + options.claimWindowMs).toISOString();
    await execute(
        `insert into "VoiceBotSession" (id, "tenantId", "botId", kind, status, "tokenHash", "expiresAt", "startedBy", "leadId", "opportunityId", snapshot, "voiceBotCallId")
         values ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11)`,
        [id, tenantId, bot.id, options.kind, tokenHash(token), expiresAt, actor.id, record.leadId, record.opportunityId, snapshotForStorage(snapshot), options.voiceBotCallId ?? null],
    );
    return { id, token, expiresAt, snapshot, record };
}

// Start a browser test call (manage access is checked by the route). Returns where the browser
// connects; the token in that address is good for one connection within two minutes.
export async function createTestSession(user: TenantUser, botId: string, target: SessionTarget) {
    const session = await prepareSession(user, botId, target, { kind: "TEST", sampleRate: TEST_SAMPLE_RATE, claimWindowMs: CLAIM_WINDOW_MS });
    return {
        sessionId: session.id,
        url: `${voiceBotPublicUrl()}/test/${session.token}`,
        expiresAt: session.expiresAt,
        sampleRate: TEST_SAMPLE_RATE,
        ai: session.snapshot.ai.primary.label,
        aiNote: session.snapshot.ai.note,
        voicePaid: session.snapshot.voicePaid,
        record: session.record,
    };
}

// A phone call's conversation (wave E): Plivo streams the call's audio, 8 kHz, to the address
// returned. The token waits while the phone rings.
export async function createCallSession(actor: TenantUser, botId: string, target: SessionTarget, voiceBotCallId: string, ringSeconds: number) {
    const session = await prepareSession(actor, botId, target, { kind: "CALL", sampleRate: PHONE_SAMPLE_RATE, claimWindowMs: (ringSeconds + 120) * 1000, voiceBotCallId });
    return { sessionId: session.id, streamUrl: `${voiceBotPublicUrl()}/plivo/${session.token}`, snapshot: session.snapshot, record: session.record };
}

// A phone call's stream token is issued when the call is answered (wave E): Plivo connects at
// once, so the token lives two minutes, and nothing has to pass between the process that placed
// the call and the one answering Plivo. Null when the session can no longer be used.
export async function issueCallStreamUrl(sessionId: string) {
    const token = `${sessionId}.${randomBytes(24).toString("base64url")}`;
    const row = await queryOneAsSystem<{ id: string }>(
        `update "VoiceBotSession" set "tokenHash" = $2, "expiresAt" = now() + interval '2 minutes', "updatedAt" = now()
         where id = $1 and kind = 'CALL' and status = 'PENDING' returning id`,
        [sessionId, tokenHash(token)],
    );
    return row ? `${voiceBotPublicUrl()}/plivo/${token}` : null;
}

// What's kept with the session: everything except the recorded audio's location.
function snapshotForStorage(snapshot: SessionSnapshot) {
    const { audio, ...rest } = snapshot;
    return { ...rest, audioLines: Object.fromEntries(Object.entries(audio).map(([id, item]) => [id, item.path])) };
}

// ---- Bot service side (internal API, signed) ------------------------------------------------------

// The bot service claims a session with its token. Each token works once, within two minutes.
export async function claimVoiceBotSession(token: string) {
    const match = /^([0-9a-f-]{36})\.[A-Za-z0-9_-]{20,}$/.exec(token);
    if (!match) return null;
    const row = await queryOneAsSystem<any>(`select id, "tenantId", "botId", kind, status, "tokenHash", "expiresAt", snapshot from "VoiceBotSession" where id = $1`, [match[1]]);
    if (!row) return null;
    const expected = Buffer.from(String(row.tokenHash), "hex");
    const given = Buffer.from(tokenHash(token), "hex");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    if (row.status !== "PENDING" || new Date(row.expiresAt).getTime() < Date.now()) return null;
    const claimed = await queryOneAsSystem<{ id: string }>(
        `update "VoiceBotSession" set status = 'ACTIVE', "claimedAt" = now(), "updatedAt" = now() where id = $1 and status = 'PENDING' returning id`,
        [row.id],
    );
    if (!claimed) return null;
    const tenantId = String(row.tenantId);
    const snapshot = row.snapshot as Omit<SessionSnapshot, "audio"> & { audioLines: Record<string, string> };
    const [groq, claude, google, azure, region, capReached] = await Promise.all([
        providerKey(tenantId, "groq"), providerKey(tenantId, "claude"), providerKey(tenantId, "google"), providerKey(tenantId, "azure"), azureRegion(tenantId), claudeCapReached(tenantId),
    ]);
    const audio: Record<string, string> = {};
    for (const [id, path] of Object.entries(snapshot.audioLines ?? {})) {
        try {
            audio[id] = (await readPrivateFile(path)).toString("base64");
        } catch {
            // A missing recording is synthesised live by the service instead.
        }
    }
    // A phone call's service hangs the call up itself when the conversation ends.
    let plivo: { authId: string; authToken: string } | null = null;
    if (row.kind === "CALL") {
        const { getActivePlivoConfig, plivoCredentials } = await import("@/lib/server/plivo");
        plivo = await getActivePlivoConfig(tenantId).then(plivoCredentials).catch(() => null);
    }
    return {
        sessionId: row.id,
        tenantId,
        kind: row.kind as "TEST" | "CALL",
        bot: snapshot,
        audio,
        plivo,
        // The bot's passages and their vectors, searched in memory during the call (wave D).
        knowledge: await knowledgeForCall(tenantId, String(row.botId)),
        keys: {
            groq,
            claude: claude && !capReached ? claude : null,
            google: snapshot.voiceProvider === "google" ? google : null,
            azure: snapshot.voiceProvider === "azure" ? azure : null,
            azureRegion: snapshot.voiceProvider === "azure" ? region : null,
        },
    };
}

async function activeSession(sessionId: string) {
    return queryOneAsSystem<{ id: string; tenantId: string; botId: string; status: string; snapshot: any; kind: string; voiceBotCallId: string | null }>(
        `select id, "tenantId", "botId", status, snapshot, kind, "voiceBotCallId" from "VoiceBotSession" where id = $1`,
        [sessionId],
    );
}

const usageSchema = z.object({
    provider: z.enum(["groq", "claude", "google", "azure"]),
    model: z.string().max(80).optional(),
    kind: z.enum(["chat", "stt", "tts"]).optional(),
    inputTokens: z.number().int().min(0).max(5_000_000).default(0),
    outputTokens: z.number().int().min(0).max(5_000_000).default(0),
    cacheReadTokens: z.number().int().min(0).max(5_000_000).default(0),
    cacheWriteTokens: z.number().int().min(0).max(5_000_000).default(0),
    characters: z.number().int().min(0).max(1_000_000).default(0),
    audioSeconds: z.number().min(0).max(36_000).default(0),
    requests: z.number().int().min(0).max(10_000).default(1),
});

// Usage the service reports during a conversation. The answer tells it whether Claude's budget
// is used up, so a Claude conversation can move to Groq straight away (decision 29).
export async function recordVoiceBotSessionUsage(sessionId: string, input: unknown) {
    const session = await activeSession(sessionId);
    if (!session || session.status !== "ACTIVE") return null;
    const usage = usageSchema.parse(input);
    const costMicroUsd = usage.provider === "claude"
        ? claudeCostMicroUsd(usage.model ?? "claude-haiku-5-5", { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cache_read_input_tokens: usage.cacheReadTokens, cache_creation_input_tokens: usage.cacheWriteTokens })
        : 0;
    await recordProviderUsage(session.tenantId, usage.provider, {
        botId: session.botId, costMicroUsd, requests: usage.requests, characters: usage.characters, audioSeconds: usage.audioSeconds, kind: usage.kind ?? null, model: usage.model ?? null,
        inputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens, outputTokens: usage.outputTokens,
    });
    return { claudeCapReached: await claudeCapReached(session.tenantId) };
}

const endSchema = z.object({
    status: z.enum(["ENDED", "FAILED"]).default("ENDED"),
    outcome: z.string().max(40).nullable().default(null),
    durationSeconds: z.number().int().min(0).max(36_000).default(0),
    error: z.string().max(500).nullable().default(null),
    transcript: z.array(z.object({
        role: z.enum(["bot", "caller"]), text: z.string().max(4000), language: z.enum(["hi", "en"]).nullable().default(null),
        at: z.number().min(0).max(36_000), interrupted: z.boolean().default(false),
    })).max(600).default([]),
    turns: z.array(z.object({
        replyMs: z.number().int().min(0).max(120_000), sttMs: z.number().int().min(0).max(120_000).nullable().default(null),
        llmMs: z.number().int().min(0).max(120_000).nullable().default(null), ttsMs: z.number().int().min(0).max(120_000).nullable().default(null),
        ai: z.string().max(40).nullable().default(null), language: z.enum(["hi", "en"]).nullable().default(null),
    })).max(600).default([]),
    events: z.array(z.object({ type: z.string().max(40), at: z.number().min(0).max(36_000), detail: z.record(z.string(), z.unknown()).default({}) })).max(300).default([]),
    fields: z.record(z.string().max(100), z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(200)).max(50), z.null()])).default({}),
});

// The service's report when a conversation ends. Sent once; a repeat changes nothing.
export async function endVoiceBotSession(sessionId: string, input: unknown) {
    const session = await activeSession(sessionId);
    if (!session) return null;
    if (session.status !== "ACTIVE") return { ok: true, alreadyEnded: true, tenantId: session.tenantId, voiceBotCallId: null as string | null };
    const result = endSchema.parse(input);
    const allowed = new Set<string>((session.snapshot?.fields ?? []).map((field: any) => String(field.key)));
    const fields = Object.fromEntries(Object.entries(result.fields).filter(([key]) => allowed.has(key)));
    await executeAsSystem(
        `update "VoiceBotSession" set status = $2, "endedAt" = now(), "updatedAt" = now(), outcome = $3, "durationSeconds" = $4, error = $5,
           transcript = $6, turns = $7, events = $8, fields = $9
         where id = $1 and status = 'ACTIVE'`,
        [sessionId, result.status, result.outcome, result.durationSeconds, result.error, JSON.stringify(result.transcript), JSON.stringify(result.turns), JSON.stringify(result.events), JSON.stringify(fields)],
    );
    // A phone call's results (summary, activity, mapping, retries) follow once the report is in.
    return { ok: true, tenantId: session.tenantId, voiceBotCallId: session.voiceBotCallId };
}

// ---- Builder side ---------------------------------------------------------------------------------

export async function getVoiceBotSession(user: TenantUser, botId: string, sessionId: string) {
    const tenantId = requireTenantId(user);
    const row = await queryOne<any>(
        `select id, kind, status, outcome, "durationSeconds", error, transcript, turns, events, fields, "createdAt", "claimedAt", "endedAt", snapshot->'fields' as "fieldLabels"
         from "VoiceBotSession" where "tenantId" = $1 and "botId" = $2 and id = $3`,
        [tenantId, botId, sessionId],
    );
    if (!row) return null;
    const labels = new Map<string, string>((row.fieldLabels ?? []).map((field: any) => [String(field.key), String(field.label)]));
    const { fieldLabels: _labels, ...rest } = row;
    return { ...rest, fields: Object.entries(row.fields ?? {}).map(([key, value]) => ({ key, label: labels.get(key) ?? key, value })) };
}

export async function recentVoiceBotSessions(user: TenantUser, botId: string, limit = 10) {
    const tenantId = requireTenantId(user);
    return query<any>(
        `select id, kind, status, outcome, "durationSeconds", "createdAt" from "VoiceBotSession" where "tenantId" = $1 and "botId" = $2 order by "createdAt" desc limit $3`,
        [tenantId, botId, Math.min(50, Math.max(1, limit))],
    );
}
