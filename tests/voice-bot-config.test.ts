import { describe, expect, it } from "vitest";
import { DEFAULT_VOICE_BOT_CONFIG, voiceBotConfigSchema } from "@/lib/voice-bot-config";
import { findMalformedPlaceholders, findPlaceholders, placeholdersOutsideDetails, renderPlaceholders } from "@/lib/voice-bot-placeholders";
import { canBulkCallWithVoiceBots, voiceBotAccess } from "@/lib/voice-bot-access-level";
import { claudeCostMicroUsd, claudeErrorCode } from "@/lib/server/voice-providers";

// Voice bot plan wave B: placeholders (decision 31), the bot settings rules, access levels
// (decision 18) and Claude cost counting (decision 29). Database behaviour: scripts/voice-bots-smoke.ts.
describe("voice bot placeholders", () => {
    it("finds placeholders with and without fallbacks", () => {
        expect(findPlaceholders("Hi {{lead.firstName|there}}, about {{ opportunity.title }}")).toEqual([
            { token: "{{lead.firstName|there}}", key: "lead.firstName", fallback: "there" },
            { token: "{{ opportunity.title }}", key: "opportunity.title", fallback: null },
        ]);
    });

    it("fills values, uses the fallback when empty, and drops an empty placeholder cleanly", () => {
        const values = { "lead.firstName": "Asha", "lead.course_interest": "MBA", "owner.name": "" };
        expect(renderPlaceholders("Namaste {{lead.firstName|ji}}, aapne {{lead.course_interest}} ke baare mein poocha tha.", values)).toBe("Namaste Asha, aapne MBA ke baare mein poocha tha.");
        expect(renderPlaceholders("Hi {{lead.name|there}}!", {})).toBe("Hi there!");
        expect(renderPlaceholders("This is {{owner.name}} , calling.", values)).toBe("This is, calling.");
        expect(renderPlaceholders("Interest: {{lead.tags}}", { "lead.tags": ["MBA", "BBA"] })).toBe("Interest: MBA, BBA");
    });

    it("points out typos and fields the bot wasn't given", () => {
        expect(findMalformedPlaceholders("Hi {{lead name}} and {{lead.name}} and {{deal.title}}")).toEqual(["{{lead name}}", "{{deal.title}}"]);
        expect(placeholdersOutsideDetails("{{lead.name}} {{lead.budget}} {{lead.budget}}", ["lead.name"])).toEqual(["lead.budget"]);
    });
});

describe("voice bot settings", () => {
    it("has safe defaults: draft-friendly, Claude Haiku, Hindi first, 10:00-19:00 Mon-Sat, 3 attempts", () => {
        expect(DEFAULT_VOICE_BOT_CONFIG.ai).toBe("claude-haiku");
        expect(DEFAULT_VOICE_BOT_CONFIG.languages).toEqual(["hi", "en"]);
        expect(DEFAULT_VOICE_BOT_CONFIG.calling).toEqual({ days: [1, 2, 3, 4, 5, 6], start: "10:00", end: "19:00", skipHolidays: true });
        expect(DEFAULT_VOICE_BOT_CONFIG.retries).toEqual({ attempts: 3, gapsMinutes: [120, 1440] });
        expect(DEFAULT_VOICE_BOT_CONFIG.callerDetails).toEqual(["lead.name", "owner.name"]);
    });

    it("refuses invalid settings", () => {
        expect(voiceBotConfigSchema.safeParse({ ai: "gpt-5" }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ languages: [] }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ calling: { days: [], start: "10:00", end: "19:00", skipHolidays: true } }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ calling: { days: [1], start: "25:00", end: "19:00", skipHolidays: true } }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ mappings: [{ fieldKey: "budget", target: "lead.budget; drop table", mode: "OVERWRITE" }] }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ callerDetails: ["lead.name", "user.password"] }).success).toBe(false);
        expect(voiceBotConfigSchema.safeParse({ openingLine: "x".repeat(601) }).success).toBe(false);
    });
});

describe("voice bot access (decision 18)", () => {
    const role = (voiceBots?: string, extra: Record<string, unknown> = {}) => ({ role: { permissions: { modules: voiceBots ? { voiceBots } : {}, ...extra } } }) as any;

    it("maps role levels: not set means use, full means manage", () => {
        expect(voiceBotAccess(role())).toBe("use");
        expect(voiceBotAccess(role("none"))).toBe("none");
        expect(voiceBotAccess(role("read"))).toBe("view");
        expect(voiceBotAccess(role("write"))).toBe("use");
        expect(voiceBotAccess(role("full"))).toBe("manage");
        expect(voiceBotAccess({ ...role("none"), isTenantAdmin: true })).toBe("manage");
    });

    it("bulk calls need the switch and at least use", () => {
        expect(canBulkCallWithVoiceBots(role("write"))).toBe(false);
        expect(canBulkCallWithVoiceBots(role("write", { voiceBotBulkCalls: true }))).toBe(true);
        expect(canBulkCallWithVoiceBots(role("read", { voiceBotBulkCalls: true }))).toBe(false);
        expect(canBulkCallWithVoiceBots({ isTenantAdmin: true } as any)).toBe(true);
    });
});

describe("Claude cost (decision 29)", () => {
    it("prices Haiku 5.5 and Sonnet 5.5 tokens, including cache reads and writes", () => {
        // Haiku: 2,000 cached ($0.01/M) + 500 new ($0.10/M) + 80 out ($0.50/M) = $0.00011.
        expect(claudeCostMicroUsd("claude-haiku-5-5", { cache_read_input_tokens: 2000, input_tokens: 500, output_tokens: 80 })).toBe(110);
        // Sonnet: 3,000 in ($2/M) + 500 out ($10/M) = $0.011.
        expect(claudeCostMicroUsd("claude-sonnet-5-5", { input_tokens: 3000, output_tokens: 500 })).toBe(11000);
        expect(claudeCostMicroUsd("claude-haiku-5-5", { cache_creation_input_tokens: 1000 })).toBe(125);
    });
});

describe("Claude errors", () => {
    it("tells Anthropic's own spend limits apart from a busy service", () => {
        expect(claudeErrorCode(429, { error: { type: "rate_limit_error", message: "You have reached your API usage limits: ...", details: { error_code: "enforced_spend_limit_reached" } } })).toBe("CLAUDE_ACCOUNT_LIMIT");
        expect(claudeErrorCode(400, { error: { type: "invalid_request_error", message: "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01." } })).toBe("CLAUDE_ACCOUNT_LIMIT");
        expect(claudeErrorCode(429, { error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } })).toBe("CLAUDE_BUSY");
        expect(claudeErrorCode(529, null)).toBe("CLAUDE_BUSY");
        expect(claudeErrorCode(401, { error: { type: "authentication_error" } })).toBe("CLAUDE_KEY_REFUSED");
        expect(claudeErrorCode(400, { error: { type: "invalid_request_error", message: "max_tokens too large" } })).toBe("CLAUDE_FAILED");
    });
});
