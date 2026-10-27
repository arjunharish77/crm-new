import { randomUUID } from "crypto";
import { executeAsSystem, queryAsSystem, queryOne, queryOneAsSystem, execute } from "@/lib/db/query";
import { decryptSecretAtRest, encryptSecretAtRest } from "@/lib/server/secret-encryption";
import { assertSafeOutboundUrl } from "@/lib/server/outbound-request-guard";

// AI and voice providers for voice bots (voice bot plan §3, §3a; decisions 7, 22, 27–30). Keys
// are entered in Voice bots › Providers and stored encrypted; they never go back to
// the browser. Claude spend is counted per month against a cap the workspace sets (decision 29).

export type VoiceProvider = "groq" | "claude" | "google" | "azure";
export const VOICE_PROVIDERS: VoiceProvider[] = ["groq", "claude", "google", "azure"];

type StoredConfig = {
    groqKey?: string | null;
    claudeKey?: string | null;
    googleKey?: string | null;
    azureKey?: string | null;
    azureRegion?: string | null;
    claudeMonthlyCapUsd?: number | null;
};

export type ProviderSettingsInput = {
    groqKey?: string | null;
    claudeKey?: string | null;
    googleKey?: string | null;
    azureKey?: string | null;
    azureRegion?: string | null;
    claudeMonthlyCapUsd?: number | string | null;
    remove?: VoiceProvider[];
};

export const CLAUDE_ALERT_LEVELS = [50, 80, 95, 100] as const;
export const DEFAULT_CLAUDE_CAP_USD = 160;

const KEY_FIELDS: Record<VoiceProvider, keyof StoredConfig> = { groq: "groqKey", claude: "claudeKey", google: "googleKey", azure: "azureKey" };

function currentMonth(now = new Date()) {
    return now.toISOString().slice(0, 7);
}

async function readStored(tenantId: string) {
    const row = await queryOne<{ config: StoredConfig | null; updatedAt: string | null }>(
        `select config, "updatedAt" from "VoiceProviderSettings" where "tenantId" = $1`,
        [tenantId],
    );
    return { config: (row?.config ?? {}) as StoredConfig, updatedAt: row?.updatedAt ?? null };
}

// The decrypted key for a provider, or null. Server only.
export async function providerKey(tenantId: string, provider: VoiceProvider) {
    const { config } = await readStored(tenantId);
    const stored = config[KEY_FIELDS[provider]];
    return typeof stored === "string" && stored ? decryptSecretAtRest(stored) : null;
}

export async function azureRegion(tenantId: string) {
    const { config } = await readStored(tenantId);
    return config.azureRegion || null;
}

function keyHint(encrypted: string | null | undefined) {
    if (!encrypted) return null;
    try {
        const key = decryptSecretAtRest(encrypted);
        return key.length > 8 ? `…${key.slice(-4)}` : "saved";
    } catch {
        return "saved";
    }
}

export async function claudeSpendThisMonth(tenantId: string) {
    const row = await queryOneAsSystem<{ cost: string | number | null }>(
        `select coalesce(sum("costMicroUsd"), 0) as cost from "VoiceProviderUsage" where "tenantId" = $1 and provider = 'claude' and month = $2`,
        [tenantId, currentMonth()],
    );
    return Number(row?.cost ?? 0) / 1_000_000;
}

export async function getVoiceProviderSettings(tenantId: string) {
    const { config, updatedAt } = await readStored(tenantId);
    const cap = Number(config.claudeMonthlyCapUsd);
    const spent = await claudeSpendThisMonth(tenantId);
    return {
        groq: { configured: !!config.groqKey, keyHint: keyHint(config.groqKey) },
        claude: {
            configured: !!config.claudeKey,
            keyHint: keyHint(config.claudeKey),
            monthlyCapUsd: Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_CLAUDE_CAP_USD,
            spentThisMonthUsd: Math.round(spent * 100) / 100,
            month: currentMonth(),
            alertLevels: CLAUDE_ALERT_LEVELS,
        },
        google: { configured: !!config.googleKey, keyHint: keyHint(config.googleKey) },
        azure: { configured: !!config.azureKey, keyHint: keyHint(config.azureKey), region: config.azureRegion ?? "" },
        updatedAt,
    };
}

export async function saveVoiceProviderSettings(tenantId: string, userId: string, input: ProviderSettingsInput) {
    const { config } = await readStored(tenantId);
    const next: StoredConfig = { ...config };
    for (const provider of VOICE_PROVIDERS) {
        const field = KEY_FIELDS[provider];
        const value = input[field as keyof ProviderSettingsInput];
        if (typeof value === "string" && value.trim()) {
            if (value.trim().length > 4000) throw new Error("VOICE_PROVIDER_KEY_INVALID");
            (next as any)[field] = encryptSecretAtRest(value.trim());
        }
        if (input.remove?.includes(provider)) (next as any)[field] = null;
    }
    if (input.azureRegion !== undefined) {
        const region = String(input.azureRegion ?? "").trim().toLowerCase();
        if (region && !/^[a-z0-9]{2,40}$/.test(region)) throw new Error("VOICE_PROVIDER_REGION_INVALID");
        next.azureRegion = region || null;
    }
    if (input.claudeMonthlyCapUsd !== undefined) {
        const cap = Number(input.claudeMonthlyCapUsd);
        if (!Number.isFinite(cap) || cap < 1 || cap > 100000) throw new Error("VOICE_PROVIDER_CAP_INVALID");
        next.claudeMonthlyCapUsd = Math.round(cap * 100) / 100;
    }
    await execute(
        `insert into "VoiceProviderSettings" ("tenantId", config, "updatedBy", "updatedAt") values ($1, $2, $3, now())
         on conflict ("tenantId") do update set config = excluded.config, "updatedBy" = excluded."updatedBy", "updatedAt" = now()`,
        [tenantId, next, userId],
    );
    return getVoiceProviderSettings(tenantId);
}

// ---- Connection tests (no calls placed, nothing billed) -----------------------------------------
async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
    await assertSafeOutboundUrl(url);
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 10000) });
    const body = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
}

export async function testVoiceProvider(tenantId: string, provider: VoiceProvider): Promise<{ ok: boolean; message: string }> {
    const key = await providerKey(tenantId, provider);
    if (!key) return { ok: false, message: "No key saved yet." };
    try {
        if (provider === "groq") {
            const result = await fetchJson("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
            if (!result.ok) return { ok: false, message: `Groq refused the key (${result.status}).` };
            const models: string[] = (result.body?.data ?? []).map((model: any) => String(model.id));
            const needed = ["whisper-large-v3", "openai/gpt-oss-20b"].filter((model) => !models.includes(model));
            return { ok: true, message: needed.length ? `Connected, but ${needed.join(" and ")} isn't available on this account.` : "Connected. Speech-to-text and the conversation models are available." };
        }
        if (provider === "claude") {
            const result = await fetchJson("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
            if (!result.ok) return { ok: false, message: `Anthropic refused the key (${result.status}).` };
            const models: string[] = (result.body?.data ?? []).map((model: any) => String(model.id));
            const needed = ["claude-haiku-5-5", "claude-sonnet-5-5"].filter((model) => !models.some((id) => id.startsWith(model)));
            return { ok: true, message: needed.length ? `Connected, but ${needed.join(" and ")} isn't available on this account.` : "Connected. Claude Haiku 5.5 and Sonnet 5.5 are available." };
        }
        if (provider === "google") {
            const result = await fetchJson("https://texttospeech.googleapis.com/v1/voices?languageCode=hi-IN", { headers: { "x-goog-api-key": key } });
            if (!result.ok) return { ok: false, message: `Google refused the key (${result.status}). Check that the Text-to-Speech API is enabled for it.` };
            const count = (result.body?.voices ?? []).filter((voice: any) => String(voice.name).includes("Chirp3-HD")).length;
            return { ok: true, message: count ? `Connected. ${count} Chirp 3 HD Hindi voices are available.` : "Connected, but no Chirp 3 HD Hindi voices were listed." };
        }
        const region = await azureRegion(tenantId);
        if (!region) return { ok: false, message: "Enter the Azure region first (for example centralindia)." };
        const result = await fetchJson(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": key } });
        if (!result.ok) return { ok: false, message: `Azure refused the key (${result.status}). Check the key and region.` };
        return { ok: true, message: "Connected. Azure neural voices are available." };
    } catch (error) {
        return { ok: false, message: error instanceof Error && error.name === "TimeoutError" ? "The provider didn't answer in time." : "The provider couldn't be reached." };
    }
}

// ---- Voices --------------------------------------------------------------------------------------
export type VoiceOption = { name: string; label: string; gender: string | null };
const LOCALES: Record<string, string> = { hi: "hi-IN", en: "en-IN" };

export async function listVoices(tenantId: string, provider: "google" | "azure", language: "hi" | "en"): Promise<VoiceOption[]> {
    const key = await providerKey(tenantId, provider);
    if (!key) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
    const locale = LOCALES[language];
    if (provider === "google") {
        const result = await fetchJson(`https://texttospeech.googleapis.com/v1/voices?languageCode=${locale}`, { headers: { "x-goog-api-key": key } });
        if (!result.ok) throw new Error("VOICE_PROVIDER_FAILED");
        return (result.body?.voices ?? [])
            .filter((voice: any) => String(voice.name).startsWith(`${locale}-Chirp3-HD-`))
            .map((voice: any) => ({ name: String(voice.name), label: String(voice.name).replace(`${locale}-Chirp3-HD-`, ""), gender: voice.ssmlGender ? String(voice.ssmlGender).toLowerCase() : null }))
            .sort((a: VoiceOption, b: VoiceOption) => a.label.localeCompare(b.label));
    }
    const region = await azureRegion(tenantId);
    if (!region) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
    const result = await fetchJson(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (!result.ok) throw new Error("VOICE_PROVIDER_FAILED");
    return (Array.isArray(result.body) ? result.body : [])
        .filter((voice: any) => voice.Locale === locale && voice.VoiceType === "Neural")
        .map((voice: any) => ({ name: String(voice.ShortName), label: String(voice.LocalName ?? voice.DisplayName ?? voice.ShortName), gender: voice.Gender ? String(voice.Gender).toLowerCase() : null }));
}

function escapeSsml(text: string) {
    return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

// A short sample of a voice saying `text` (an MP3), for "Play sample" in the builder.
export async function synthesizeSample(tenantId: string, provider: "google" | "azure", voice: string, language: "hi" | "en", text: string) {
    const key = await providerKey(tenantId, provider);
    if (!key) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
    const sample = text.trim().slice(0, 300);
    if (!sample || !/^[A-Za-z0-9-]{3,100}$/.test(voice)) throw new Error("VOICE_SAMPLE_INVALID");
    const locale = LOCALES[language];
    if (provider === "google") {
        const result = await fetchJson("https://texttospeech.googleapis.com/v1/text:synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ input: { text: sample }, voice: { languageCode: locale, name: voice }, audioConfig: { audioEncoding: "MP3" } }),
            timeoutMs: 15000,
        });
        if (!result.ok || !result.body?.audioContent) throw new Error("VOICE_PROVIDER_FAILED");
        return Buffer.from(String(result.body.audioContent), "base64");
    }
    const region = await azureRegion(tenantId);
    if (!region) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
    const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
    await assertSafeOutboundUrl(url);
    const response = await fetch(url, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" },
        body: `<speak version="1.0" xml:lang="${locale}"><voice name="${voice}">${escapeSsml(sample)}</voice></speak>`,
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("VOICE_PROVIDER_FAILED");
    return Buffer.from(await response.arrayBuffer());
}

// ---- Voice allowances (decision 33) --------------------------------------------------------------
// Characters a month each provider gives free (checked 2026-10-27). A call's voice is chosen when
// it starts: the bot's own provider while it has free characters left, then the other one, then
// Google at the paid rate. Switching at 90% leaves room for the calls already running.
export const FREE_VOICE_CHARACTERS: Record<"google" | "azure", number> = { google: 1_000_000, azure: 500_000 };
const VOICE_SWITCH_SHARE = 0.9;

export async function voiceCharactersThisMonth(tenantId: string) {
    const rows = await queryAsSystem<{ provider: string; characters: string | number }>(
        `select provider, coalesce(sum(characters), 0) as characters from "VoiceProviderUsage"
         where "tenantId" = $1 and month = $2 and provider in ('google', 'azure') group by provider`,
        [tenantId, currentMonth()],
    );
    const used = { google: 0, azure: 0 };
    for (const row of rows) used[row.provider as "google" | "azure"] = Number(row.characters ?? 0);
    return used;
}

// Same-gender stand-ins when a call has to use the other provider than the bot's voices.
const CHIRP_FEMALE = new Set(["Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Gacrux", "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat", "Vindemiatrix", "Zephyr"]);
const AZURE_FEMALE = new Set(["hi-IN-SwaraNeural", "hi-IN-AnanyaNeural", "hi-IN-KavyaNeural", "hi-IN-AartiNeural", "en-IN-NeerjaNeural", "en-IN-AashiNeural", "en-IN-AnanyaNeural", "en-IN-KavyaNeural", "en-IN-AartiNeural"]);
const STAND_IN_VOICES = {
    google: { female: { hi: "hi-IN-Chirp3-HD-Aoede", en: "en-IN-Chirp3-HD-Aoede" }, male: { hi: "hi-IN-Chirp3-HD-Charon", en: "en-IN-Chirp3-HD-Charon" } },
    azure: { female: { hi: "hi-IN-SwaraNeural", en: "en-IN-NeerjaNeural" }, male: { hi: "hi-IN-MadhurNeural", en: "en-IN-PrabhatNeural" } },
} as const;

export function voiceGender(provider: "google" | "azure", voice: string): "female" | "male" {
    if (provider === "google") return CHIRP_FEMALE.has(voice.split("-Chirp3-HD-")[1] ?? "") ? "female" : "male";
    return AZURE_FEMALE.has(voice) ? "female" : "male";
}

type BotVoices = { hi: { provider: "google" | "azure"; voice: string }; en: { provider: "google" | "azure"; voice: string } };

// The provider and voices a call starting now uses. `paid` means Google past its free amount.
export function chooseCallVoices(voices: BotVoices, configured: { google: boolean; azure: boolean }, used: { google: number; azure: number }) {
    const preferred = voices.hi.provider;
    const other = preferred === "google" ? "azure" : "google";
    const hasFree = (provider: "google" | "azure") => configured[provider] && used[provider] < FREE_VOICE_CHARACTERS[provider] * VOICE_SWITCH_SHARE;
    const provider: "google" | "azure" | null = hasFree(preferred) ? preferred : hasFree(other) ? other : configured.google ? "google" : null;
    if (!provider) return null;
    const paid = !hasFree(provider);
    const pick = (language: "hi" | "en") => {
        const own = voices[language];
        if (own.provider === provider && own.voice) return own.voice;
        return STAND_IN_VOICES[provider][voiceGender(own.provider, own.voice)][language];
    };
    return { provider, paid, voices: { hi: { provider, voice: pick("hi") }, en: { provider, voice: pick("en") } } };
}

// Admins hear once a month when bots start speaking at Google's paid rate.
export async function alertPaidVoiceOnce(tenantId: string) {
    const inserted = await queryOneAsSystem<{ id: string }>(
        `insert into "VoiceProviderAlert" (id, "tenantId", provider, month, level) values ($1, $2, 'google-paid', $3, 100)
         on conflict ("tenantId", provider, month, level) do nothing returning id`,
        [randomUUID(), tenantId, currentMonth()],
    );
    if (!inserted) return;
    const { createUserNotification } = await import("@/lib/server/notifications");
    const message = "This month's free voice characters (Google and Azure) are used up, so voice bots now speak with Google's voice at the paid rate, about $30 per million characters.";
    for (const userId of await tenantAdminIds(tenantId)) {
        await createUserNotification({ tenantId, userId, title: "Voice bots now use paid voice", message, data: { type: "VOICE_BOT_PAID_VOICE" } }).catch(() => undefined);
    }
}

// Raw 16-bit mono PCM of `text` at `sampleRate`, for lines a bot says the same way each time
// (fillers, "are you there?", the opening). Counts the characters against the month.
export async function synthesizePcm(tenantId: string, input: { provider: "google" | "azure"; voice: string; language: "hi" | "en"; text: string; sampleRate: 8000 | 16000 | 24000; botId?: string | null }) {
    const key = await providerKey(tenantId, input.provider);
    if (!key) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
    const text = input.text.trim().slice(0, 1000);
    if (!text || !/^[A-Za-z0-9-]{3,100}$/.test(input.voice)) throw new Error("VOICE_SAMPLE_INVALID");
    const locale = LOCALES[input.language];
    let pcm: Buffer;
    if (input.provider === "google") {
        const result = await fetchJson("https://texttospeech.googleapis.com/v1/text:synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({ input: { text }, voice: { languageCode: locale, name: input.voice }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: input.sampleRate } }),
            timeoutMs: 15000,
        });
        if (!result.ok || !result.body?.audioContent) throw new Error("VOICE_PROVIDER_FAILED");
        pcm = stripWavHeader(Buffer.from(String(result.body.audioContent), "base64"));
    } else {
        const region = await azureRegion(tenantId);
        if (!region) throw new Error("VOICE_PROVIDER_NOT_CONFIGURED");
        const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
        await assertSafeOutboundUrl(url);
        const response = await fetch(url, {
            method: "POST",
            headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": `raw-${input.sampleRate / 1000}khz-16bit-mono-pcm` },
            body: `<speak version="1.0" xml:lang="${locale}"><voice name="${input.voice}">${escapeSsml(text)}</voice></speak>`,
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("VOICE_PROVIDER_FAILED");
        pcm = Buffer.from(await response.arrayBuffer());
    }
    await recordProviderUsage(tenantId, input.provider, { botId: input.botId ?? null, costMicroUsd: 0, characters: text.length });
    return pcm;
}

// Google's LINEAR16 comes as a WAV file; keep only the samples of its "data" chunk.
export function stripWavHeader(wav: Buffer) {
    if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return wav;
    let offset = 12;
    while (offset + 8 <= wav.length) {
        const id = wav.toString("ascii", offset, offset + 4);
        const size = wav.readUInt32LE(offset + 4);
        if (id === "data") return wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size));
        offset += 8 + size + (size % 2);
    }
    return Buffer.alloc(0);
}

// ---- Claude (Anthropic) --------------------------------------------------------------------------
// Prices in US dollars per million tokens (Anthropic pricing page, 2026-10-27; prompts under 100K
// tokens for Haiku 5.5).
const CLAUDE_PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
    "claude-haiku-5-5": { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.10, cacheWrite: 2.50 },
};

export function claudeCostMicroUsd(model: string, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }) {
    const price = CLAUDE_PRICES[model] ?? CLAUDE_PRICES["claude-sonnet-5-5"];
    const dollars =
        ((usage.input_tokens ?? 0) * price.input + (usage.output_tokens ?? 0) * price.output +
            (usage.cache_read_input_tokens ?? 0) * price.cacheRead + (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite) / 1_000_000;
    return Math.ceil(dollars * 1_000_000);
}

export async function claudeCapReached(tenantId: string) {
    const settings = await getVoiceProviderSettings(tenantId);
    return settings.claude.spentThisMonthUsd >= settings.claude.monthlyCapUsd;
}

async function tenantAdminIds(tenantId: string) {
    const rows = await queryAsSystem<{ id: string }>(
        `select u.id from "User" u join "Role" r on r.id = u."roleId"
         where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
           and r.permissions -> 'modules' ->> 'admin' = 'full'`,
        [tenantId],
    );
    return rows.map((row) => row.id);
}

// ---- Free limits (wave G; checked 2026-10-26/27) ----------------------------------------------------
// Groq's free tier is per model per day (gpt-oss: 1,000 requests and 200,000 tokens) and, for
// Whisper, 2,000 requests and 28,800 audio seconds a day. The voices are free per month
// (FREE_VOICE_CHARACTERS). Each use is counted on a meter, per UTC day.
export type UsageMeterLimit = { period: "day" | "month"; requests?: number; tokens?: number; audioSeconds?: number; characters?: number };
export const FREE_LIMITS: Record<"groq-chat" | "groq-whisper" | "google-tts" | "azure-tts", UsageMeterLimit> = {
    "groq-chat": { period: "day", requests: 1_000, tokens: 200_000 },
    "groq-whisper": { period: "day", requests: 2_000, audioSeconds: 28_800 },
    "google-tts": { period: "month", characters: FREE_VOICE_CHARACTERS.google },
    "azure-tts": { period: "month", characters: FREE_VOICE_CHARACTERS.azure },
};
export const USAGE_ALERT_PERCENT = 80;

export function usageMeter(provider: VoiceProvider, input: { kind?: string | null; model?: string | null; audioSeconds?: number }) {
    if (provider === "claude") return "claude";
    if (provider === "google" || provider === "azure") return `${provider}-tts`;
    if (input.kind === "stt" || (!input.kind && Number(input.audioSeconds ?? 0) > 0)) return "groq-whisper";
    return `groq-chat:${(input.model || "openai/gpt-oss-20b").slice(0, 60)}`;
}

export function meterLimit(meter: string): UsageMeterLimit | null {
    return FREE_LIMITS[(meter.startsWith("groq-chat:") ? "groq-chat" : meter) as keyof typeof FREE_LIMITS] ?? null;
}

// How much of a meter's free limit is used, by its fullest measure (0-100+).
export function meterPercent(limit: UsageMeterLimit, used: { requests?: number; tokens?: number; audioSeconds?: number; characters?: number }) {
    const shares = (["requests", "tokens", "audioSeconds", "characters"] as const)
        .filter((key) => limit[key])
        .map((key) => (Number(used[key] ?? 0) / limit[key]!) * 100);
    return shares.length ? Math.max(...shares) : 0;
}

function utcDay(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

// Today's (and this month's, for voices) use of every meter with a free limit.
export async function usageMeters(tenantId: string) {
    const day = utcDay();
    const rows = await queryAsSystem<{ meter: string; requests: number; tokens: string; audioSeconds: string; characters: string }>(
        `select meter, requests, tokens, "audioSeconds", characters from "VoiceProviderDailyUsage" where "tenantId" = $1 and day = $2::date and meter like 'groq-%'`,
        [tenantId, day],
    );
    const voices = await voiceCharactersThisMonth(tenantId);
    const meters = rows.map((row) => {
        const used = { requests: Number(row.requests), tokens: Number(row.tokens), audioSeconds: Number(row.audioSeconds), characters: Number(row.characters) };
        const limit = meterLimit(row.meter)!;
        return { meter: row.meter, period: limit.period, used, limit, percent: Math.round(meterPercent(limit, used)) };
    });
    for (const provider of ["google", "azure"] as const) {
        const limit = FREE_LIMITS[`${provider}-tts`];
        const used = { characters: voices[provider] };
        meters.push({ meter: `${provider}-tts`, period: "month", used: { requests: 0, tokens: 0, audioSeconds: 0, ...used }, limit, percent: Math.round(meterPercent(limit, used)) });
    }
    return { day, month: currentMonth(), meters: meters.sort((a, b) => a.meter.localeCompare(b.meter)) };
}

const METER_NAMES: Record<string, string> = { "groq-whisper": "Groq Whisper (hearing callers)", "google-tts": "Google voice", "azure-tts": "Azure voice" };
export function meterName(meter: string) {
    return METER_NAMES[meter] ?? (meter.startsWith("groq-chat:") ? `Groq ${meter.slice("groq-chat:".length).replace(/^openai\//, "")}` : meter);
}

const METER_AFTER: Record<string, string> = {
    "groq-chat": "At the limit Groq refuses this model until the next day (UTC), and bots on it switch to Claude if a Claude key is set.",
    "groq-whisper": "At the limit bots can't hear callers until the next day (UTC). Consider Groq's paid tier if this happens often.",
    "google-tts": "At 90% new calls switch to Azure's free voice, then to Google at the paid rate.",
    "azure-tts": "When it runs out, new calls use Google's voice at the paid rate.",
};

// One alert per meter and period when 80% of a free limit is used.
async function alertNearFreeLimit(tenantId: string, meter: string, percent: number, period: string) {
    if (percent < USAGE_ALERT_PERCENT) return;
    const inserted = await queryOneAsSystem<{ id: string }>(
        `insert into "VoiceProviderAlert" (id, "tenantId", provider, month, level) values ($1, $2, $3, $4, $5)
         on conflict ("tenantId", provider, month, level) do nothing returning id`,
        [randomUUID(), tenantId, meter, period, USAGE_ALERT_PERCENT],
    );
    if (!inserted) return;
    const { createUserNotification } = await import("@/lib/server/notifications");
    const limit = meterLimit(meter)!;
    const title = `${meterName(meter)}: over ${USAGE_ALERT_PERCENT}% of the free ${limit.period === "day" ? "daily" : "monthly"} limit used`;
    const message = `Voice bots have used ${Math.round(percent)}% of ${meterName(meter)}'s free ${limit.period === "day" ? "limit for today" : "amount this month"}. ${METER_AFTER[meter.startsWith("groq-chat:") ? "groq-chat" : meter] ?? ""}`.trim();
    for (const userId of await tenantAdminIds(tenantId)) {
        await createUserNotification({ tenantId, userId, title, message, data: { type: "VOICE_BOT_FREE_LIMIT", meter, period } }).catch(() => undefined);
    }
}

// Adds spend and use for this month and today's meter, then sends each budget alert once
// (Claude: 50/80/95/100%) and the 80% free-limit alerts.
export async function recordProviderUsage(tenantId: string, provider: VoiceProvider, input: {
    botId?: string | null; costMicroUsd: number; inputTokens?: number; outputTokens?: number; requests?: number; characters?: number; audioSeconds?: number;
    kind?: "chat" | "stt" | "tts" | null; model?: string | null;
}) {
    const count = (value: number | undefined) => Math.max(0, Math.round(Number(value ?? 0) || 0));
    await executeAsSystem(
        `insert into "VoiceProviderUsage" (id, "tenantId", provider, month, "botId", "costMicroUsd", "inputTokens", "outputTokens", requests, characters, "audioSeconds", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         on conflict ("tenantId", provider, month, coalesce("botId", '')) do update
           set "costMicroUsd" = "VoiceProviderUsage"."costMicroUsd" + excluded."costMicroUsd",
               "inputTokens" = "VoiceProviderUsage"."inputTokens" + excluded."inputTokens",
               "outputTokens" = "VoiceProviderUsage"."outputTokens" + excluded."outputTokens",
               requests = "VoiceProviderUsage".requests + excluded.requests,
               characters = "VoiceProviderUsage".characters + excluded.characters,
               "audioSeconds" = "VoiceProviderUsage"."audioSeconds" + excluded."audioSeconds",
               "updatedAt" = now()`,
        [randomUUID(), tenantId, provider, currentMonth(), input.botId ?? null, count(input.costMicroUsd), count(input.inputTokens), count(input.outputTokens),
            input.requests === undefined ? 1 : count(input.requests), count(input.characters), Math.max(0, Math.round(Number(input.audioSeconds ?? 0) * 100) / 100 || 0)],
    );
    const meter = usageMeter(provider, input);
    const day = await queryOneAsSystem<{ requests: number; tokens: string; audioSeconds: string; characters: string }>(
        `insert into "VoiceProviderDailyUsage" (id, "tenantId", day, meter, requests, tokens, "audioSeconds", characters, "updatedAt")
         values ($1, $2, $3::date, $4, $5, $6, $7, $8, now())
         on conflict ("tenantId", day, meter) do update
           set requests = "VoiceProviderDailyUsage".requests + excluded.requests,
               tokens = "VoiceProviderDailyUsage".tokens + excluded.tokens,
               "audioSeconds" = "VoiceProviderDailyUsage"."audioSeconds" + excluded."audioSeconds",
               characters = "VoiceProviderDailyUsage".characters + excluded.characters,
               "updatedAt" = now()
         returning requests, tokens, "audioSeconds", characters`,
        [randomUUID(), tenantId, utcDay(), meter, input.requests === undefined ? 1 : count(input.requests), count(input.inputTokens) + count(input.outputTokens),
            Math.max(0, Math.round(Number(input.audioSeconds ?? 0) * 100) / 100 || 0), count(input.characters)],
    );
    const limit = meterLimit(meter);
    if (limit?.period === "day" && day) {
        const used = { requests: Number(day.requests), tokens: Number(day.tokens), audioSeconds: Number(day.audioSeconds), characters: Number(day.characters) };
        await alertNearFreeLimit(tenantId, meter, meterPercent(limit, used), utcDay());
    } else if (limit?.period === "month" && (provider === "google" || provider === "azure")) {
        const voices = await voiceCharactersThisMonth(tenantId);
        await alertNearFreeLimit(tenantId, meter, meterPercent(limit, { characters: voices[provider] }), currentMonth());
    }
    if (provider !== "claude") return;
    const settings = await getVoiceProviderSettings(tenantId);
    const percent = (settings.claude.spentThisMonthUsd / settings.claude.monthlyCapUsd) * 100;
    for (const level of CLAUDE_ALERT_LEVELS) {
        if (percent < level) continue;
        const inserted = await queryOneAsSystem<{ id: string }>(
            `insert into "VoiceProviderAlert" (id, "tenantId", provider, month, level) values ($1, $2, 'claude', $3, $4)
             on conflict ("tenantId", provider, month, level) do nothing returning id`,
            [randomUUID(), tenantId, settings.claude.month, level],
        );
        if (!inserted) continue;
        const { createUserNotification } = await import("@/lib/server/notifications");
        const title = level >= 100 ? "Claude budget used up" : `Claude budget ${level}% used`;
        const message = level >= 100
            ? `Voice bots have used this month's Claude budget ($${settings.claude.monthlyCapUsd}). Bots use Groq until next month, or until the cap is raised in Voice bots › Providers.`
            : `Voice bots have used $${settings.claude.spentThisMonthUsd.toFixed(2)} of this month's $${settings.claude.monthlyCapUsd} Claude budget.`;
        for (const userId of await tenantAdminIds(tenantId)) {
            await createUserNotification({ tenantId, userId, title, message, data: { type: "VOICE_BOT_BUDGET", level } }).catch(() => undefined);
        }
    }
}

// Anthropic's own spend limits (the organisation's tier cap, or a limit set in the Console for the
// organisation or workspace) answer 429 with `enforced_spend_limit_reached`, or 400 with "You have
// reached your specified ... API usage limits". Neither clears on retry, so they aren't "busy".
export function claudeErrorCode(status: number, body: any) {
    const error = body?.error ?? {};
    const message = String(error.message ?? "");
    if (error.details?.error_code === "enforced_spend_limit_reached" || /you have reached your (specified )?(workspace )?api usage limits/i.test(message)) return "CLAUDE_ACCOUNT_LIMIT";
    if (/credit balance is too low/i.test(message)) return "CLAUDE_NO_CREDIT";
    if (status === 401 || status === 403) return "CLAUDE_KEY_REFUSED";
    if (status === 429 || status === 529 || status === 503) return "CLAUDE_BUSY";
    return "CLAUDE_FAILED";
}

type ClaudeRequest = {
    model: "claude-haiku-5-5" | "claude-sonnet-5-5";
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
    tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    toolChoice?: { type: "tool"; name: string };
    botId?: string | null;
    timeoutMs?: number;
};

// One Claude request, refused when the month's cap is reached, with its cost added to the month.
export async function callClaude(tenantId: string, request: ClaudeRequest) {
    const key = await providerKey(tenantId, "claude");
    if (!key) throw new Error("CLAUDE_NOT_CONFIGURED");
    if (await claudeCapReached(tenantId)) throw new Error("CLAUDE_CAP_REACHED");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        // Claude 5.5 models don't accept a forced tool (tool_choice "tool" or "any"), so the tool is
        // offered with "auto" and the instruction to answer with it; an answer without it fails below.
        body: JSON.stringify({
            model: request.model,
            max_tokens: request.maxTokens,
            system: [{ type: "text", text: request.toolChoice ? `${request.system}\n\nAnswer only by calling the ${request.toolChoice.name} tool, once, with every required field.` : request.system, cache_control: { type: "ephemeral" } }],
            messages: request.messages,
            ...(request.tools ? { tools: request.tools } : {}),
            ...(request.toolChoice ? { tool_choice: { type: "auto" } } : {}),
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 60000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const code = claudeErrorCode(response.status, body);
        // Anthropic's reason, for the server log (it never contains the key).
        console.warn(JSON.stringify({ level: "warn", msg: "CLAUDE_REQUEST_FAILED", code, status: response.status, type: body?.error?.type ?? null, reason: String(body?.error?.message ?? "").slice(0, 300) }));
        throw new Error(code);
    }
    if (body?.usage) {
        await recordProviderUsage(tenantId, "claude", {
            botId: request.botId,
            costMicroUsd: claudeCostMicroUsd(request.model, body.usage),
            inputTokens: (body.usage.input_tokens ?? 0) + (body.usage.cache_read_input_tokens ?? 0) + (body.usage.cache_creation_input_tokens ?? 0),
            outputTokens: body.usage.output_tokens ?? 0,
        });
    }
    const result = body as { content: Array<{ type: string; text?: string; name?: string; input?: any }>; stop_reason: string };
    if (request.toolChoice && !result?.content?.some((part) => part.type === "tool_use" && part.name === request.toolChoice!.name)) {
        console.warn(JSON.stringify({ level: "warn", msg: "CLAUDE_TOOL_NOT_USED", tool: request.toolChoice.name, stop: result?.stop_reason ?? null }));
        throw new Error("CLAUDE_FAILED");
    }
    return result;
}

// ---- Groq (text) -----------------------------------------------------------------------------------
// One JSON answer from a Groq model, for the after-call summary when Claude isn't available or its
// budget is used up (decision 30). Groq's free tier costs nothing, so only the request is counted.
export async function callGroqJson(tenantId: string, input: { model: "openai/gpt-oss-120b" | "openai/gpt-oss-20b"; system: string; user: string; botId?: string | null; maxTokens?: number }) {
    const key = await providerKey(tenantId, "groq");
    if (!key) throw new Error("GROQ_NOT_CONFIGURED");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: input.model,
            messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
            response_format: { type: "json_object" },
            reasoning_effort: "low",
            max_tokens: input.maxTokens ?? 1500,
            temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(response.status === 401 ? "GROQ_KEY_REFUSED" : response.status === 429 ? "GROQ_BUSY" : "GROQ_FAILED");
    await recordProviderUsage(tenantId, "groq", { botId: input.botId ?? null, costMicroUsd: 0, inputTokens: body?.usage?.prompt_tokens ?? 0, outputTokens: body?.usage?.completion_tokens ?? 0, kind: "chat", model: input.model });
    const text = String(body?.choices?.[0]?.message?.content ?? "");
    try {
        return JSON.parse(text);
    } catch {
        throw new Error("GROQ_FAILED");
    }
}
