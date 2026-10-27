import { z } from "zod";

// A voice bot's settings (voice bot plan §4.3; decisions 2026-10-26/27). Shared by the server,
// which checks every save against this schema, and the builder screens.

export const VOICE_BOT_AI_OPTIONS = [
    { value: "groq-20b", label: "Groq · gpt-oss-20b", provider: "groq", model: "openai/gpt-oss-20b", description: "Fastest replies. Free tier." },
    { value: "groq-120b", label: "Groq · gpt-oss-120b", provider: "groq", model: "openai/gpt-oss-120b", description: "Stronger reasoning, a little slower. Free tier." },
    { value: "claude-haiku", label: "Claude Haiku 5.5", provider: "claude", model: "claude-haiku-5-5", description: "Better Hindi and rule-following. About $0.002–0.005 a call." },
    { value: "claude-sonnet", label: "Claude Sonnet 5.5", provider: "claude", model: "claude-sonnet-5-5", description: "Smartest, slower replies. About $0.03 a call." },
] as const;
export type VoiceBotAi = (typeof VOICE_BOT_AI_OPTIONS)[number]["value"];

export const VOICE_BOT_LANGUAGES = [
    { value: "hi", label: "Hindi" },
    { value: "en", label: "English" },
] as const;

export const WEEKDAYS = [
    { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" },
    { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 0, label: "Sun" },
] as const;

export const MAPPING_MODES = [
    { value: "IF_EMPTY", label: "Fill if empty" },
    { value: "OVERWRITE", label: "Always overwrite" },
    { value: "NEVER", label: "Never copy" },
] as const;

const text = (max: number) => z.string().max(max).default("");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00");

const voiceChoice = z.object({
    provider: z.enum(["google", "azure"]).default("google"),
    voice: z.string().max(120).default(""),
});

const answerAction = z.object({
    equals: z.string().max(200),
    action: z.enum(["continue", "end", "transfer"]),
});

export const fixedStepSchema = z.object({
    id: z.string().min(1).max(60),
    kind: z.enum(["say", "ask"]),
    text: z.string().max(1000),
    // "ask": the answer is saved to this bot field (optional), and can end or transfer the call.
    fieldKey: z.string().max(100).nullable().default(null),
    onAnswer: z.array(answerAction).max(10).default([]),
});
export type FixedStep = z.infer<typeof fixedStepSchema>;

export const fieldQuestionSchema = z.object({
    question: z.string().max(500).default(""),
    mustAsk: z.boolean().default(false),
    // Repeat the answer back before saving it (names, numbers, dates).
    confirm: z.boolean().default(false),
});

export const mappingSchema = z.object({
    fieldKey: z.string().min(1).max(100),
    target: z.string().regex(/^(lead|opportunity)\.[A-Za-z0-9_]+$/, "Choose a lead or opportunity field"),
    mode: z.enum(["IF_EMPTY", "OVERWRITE", "NEVER"]).default("IF_EMPTY"),
});
export type FieldMapping = z.infer<typeof mappingSchema>;

export const voiceBotConfigSchema = z.object({
    description: text(500),
    languages: z.array(z.enum(["hi", "en"])).min(1, "Choose at least one language").default(["hi", "en"]),
    // The language a call starts in; the bot then follows the caller (decision 16).
    startLanguage: z.enum(["hi", "en"]).default("hi"),
    voices: z.object({ hi: voiceChoice.default({ provider: "google", voice: "" }), en: voiceChoice.default({ provider: "google", voice: "" }) }).default({ hi: { provider: "google", voice: "" }, en: { provider: "google", voice: "" } }),
    ai: z.enum(["groq-20b", "groq-120b", "claude-haiku", "claude-sonnet"]).default("claude-haiku"),
    persona: text(4000),
    goal: text(2000),
    rules: text(6000),
    openingLine: text(600),
    closingLine: text(600),
    fixedSteps: z.object({ before: z.array(fixedStepSchema).max(20).default([]), after: z.array(fixedStepSchema).max(20).default([]) }).default({ before: [], after: [] }),
    endRule: text(1000),
    transfer: z.object({
        enabled: z.boolean().default(true),
        rule: text(1000),
        teamId: z.string().max(100).nullable().default(null),
        ringSeconds: z.number().int().min(10).max(120).default(25),
    }).default({ enabled: true, rule: "", teamId: null, ringSeconds: 25 }),
    fieldQuestions: z.record(z.string().max(100), fieldQuestionSchema).default({}),
    mappings: z.array(mappingSchema).max(100).default([]),
    // Lead/opportunity fields this bot may see and use as {{placeholders}} (decision 31).
    callerDetails: z.array(z.string().regex(/^(lead|opportunity|owner)\.[A-Za-z0-9_]+$/)).max(60).default(["lead.name", "owner.name"]),
    // Which opportunity a call started from a lead uses (decision 32).
    opportunityChoice: z.object({
        mode: z.enum(["LATEST_OPEN", "LATEST_OF_TYPE", "NONE"]).default("LATEST_OPEN"),
        typeId: z.string().max(100).nullable().default(null),
    }).default({ mode: "LATEST_OPEN", typeId: null }),
    outboundNumber: z.string().max(20).nullable().default(null),
    calling: z.object({
        days: z.array(z.number().int().min(0).max(6)).min(1, "Choose at least one day").default([1, 2, 3, 4, 5, 6]),
        start: time.default("10:00"),
        end: time.default("19:00"),
        skipHolidays: z.boolean().default(true),
    }).default({ days: [1, 2, 3, 4, 5, 6], start: "10:00", end: "19:00", skipHolidays: true }),
    retries: z.object({
        attempts: z.number().int().min(1).max(5).default(3),
        // Minutes to wait before each retry (2 hours, then the next day).
        gapsMinutes: z.array(z.number().int().min(15).max(10080)).max(4).default([120, 1440]),
    }).default({ attempts: 3, gapsMinutes: [120, 1440] }),
    // New enquiries from these lead sources are called within about a minute (plan §5, wave F).
    enquiryCalls: z.object({
        enabled: z.boolean().default(false),
        sources: z.array(z.string().min(1).max(120)).max(50).default([]),
    }).default({ enabled: false, sources: [] }),
    answeringMachine: z.enum(["NOT_ANSWERED", "OFF"]).default("NOT_ANSWERED"),
    dailyLimit: z.number().int().min(1).max(1000).default(20),
    keepAudio: z.boolean().default(true),
    maxCallMinutes: z.number().int().min(1).max(30).default(8),
    silenceSeconds: z.number().int().min(4).max(30).default(8),
});
export type VoiceBotConfig = z.infer<typeof voiceBotConfigSchema>;

export const DEFAULT_VOICE_BOT_CONFIG: VoiceBotConfig = voiceBotConfigSchema.parse({});

export type VoiceBotStatus = "DRAFT" | "LIVE" | "PAUSED";

// Built-in fields a bot can be given as caller details. Custom lead and opportunity fields are
// added from the workspace's field list (key as in `lead.<key>`).
export const STANDARD_CALLER_DETAILS = [
    { key: "lead.name", label: "Lead name", group: "Lead" },
    { key: "lead.firstName", label: "Lead first name", group: "Lead" },
    { key: "lead.phone", label: "Lead phone", group: "Lead" },
    { key: "lead.email", label: "Lead email", group: "Lead" },
    { key: "lead.company", label: "Company / school", group: "Lead" },
    { key: "lead.source", label: "Lead source", group: "Lead" },
    { key: "lead.status", label: "Lead status", group: "Lead" },
    { key: "opportunity.title", label: "Opportunity title", group: "Opportunity" },
    { key: "opportunity.type", label: "Opportunity type", group: "Opportunity" },
    { key: "opportunity.stage", label: "Opportunity stage", group: "Opportunity" },
    { key: "opportunity.amount", label: "Opportunity amount", group: "Opportunity" },
    { key: "opportunity.expectedCloseDate", label: "Expected close date", group: "Opportunity" },
    { key: "owner.name", label: "Owner name", group: "Owner" },
    { key: "owner.firstName", label: "Owner first name", group: "Owner" },
] as const;

// Standard lead/opportunity fields a bot answer can be copied to (custom fields are added).
export const STANDARD_MAPPING_TARGETS = [
    { key: "lead.name", label: "Lead name" },
    { key: "lead.email", label: "Lead email" },
    { key: "lead.company", label: "Company / school" },
    { key: "lead.source", label: "Lead source" },
    { key: "opportunity.amount", label: "Opportunity amount" },
    { key: "opportunity.expectedCloseDate", label: "Expected close date" },
] as const;
