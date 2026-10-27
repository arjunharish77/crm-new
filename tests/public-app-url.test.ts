import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAppOrigin } from "@/lib/server/public-app-url";
import { voiceBotPublicUrl } from "@/lib/server/voice-bot-service";

afterEach(() => vi.unstubAllEnvs());

describe("public CRM and voice bot callback URLs", () => {
    it("uses the configured HTTPS origin for Plivo and the bot WebSocket", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_URL", "https://crm.example.com/");
        vi.stubEnv("VOICE_BOT_PUBLIC_URL", "");
        expect(publicAppOrigin()).toBe("https://crm.example.com");
        expect(voiceBotPublicUrl()).toBe("wss://crm.example.com/voice-bot");
    });

    it("gives a specific error when the running container has no APP_URL", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_URL", "");
        vi.stubEnv("VOICE_BOT_PUBLIC_URL", "");
        expect(publicAppOrigin).toThrow("PUBLIC_APP_URL_MISSING");
        expect(voiceBotPublicUrl).toThrow("PUBLIC_APP_URL_MISSING");
    });

    it.each(["crm.example.com", "https://crm.example.com/path", "https://user:password@crm.example.com", "https://crm.example.com?x=1"])(
        "rejects malformed or unsafe APP_URL %s before making a call",
        (value) => {
            vi.stubEnv("NODE_ENV", "production");
            vi.stubEnv("APP_URL", value);
            expect(publicAppOrigin).toThrow("PUBLIC_APP_URL_INVALID");
        },
    );

    it("requires HTTPS in production and secure WebSockets for an explicit bot URL", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_URL", "http://crm.example.com");
        expect(publicAppOrigin).toThrow("PUBLIC_APP_URL_HTTPS_REQUIRED");
        vi.stubEnv("APP_URL", "https://crm.example.com");
        vi.stubEnv("VOICE_BOT_PUBLIC_URL", "ws://crm.example.com/voice-bot");
        expect(voiceBotPublicUrl).toThrow("VOICE_BOT_PUBLIC_URL_INVALID");
    });
});
