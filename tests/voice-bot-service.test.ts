import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/query", () => ({ execute: vi.fn(), query: vi.fn(), queryOne: vi.fn(), queryAsSystem: vi.fn(), queryOneAsSystem: vi.fn(), executeAsSystem: vi.fn() }));

import { signVoiceBotRequest, verifyVoiceBotSignature, voiceBotPublicUrl } from "@/lib/server/voice-bot-service";
import { chooseCallVoices, FREE_VOICE_CHARACTERS, stripWavHeader, voiceGender } from "@/lib/server/voice-providers";
import { cannedLines } from "@/lib/server/voice-bot-sessions";

// Voice bot plan wave C: the CRM ⇄ bot service signature, the voice chosen for a call
// (decision 33) and the built-in lines. The service checks the same vector in
// voice-bot/tests/test_units.py, so both sides sign identically.
const SECRET = "test-secret-0123456789abcdef0123456789";
const VECTOR = "t=1793000000,v1=142f5b7111cd85fefb36d4b5224596f61d4eb97cd1101ca3c28643d685d2bfdc";

describe("voice bot service signature", () => {
    it("matches the bot service's signing", () => {
        expect(signVoiceBotRequest(SECRET, "POST", "/api/internal/voice-bot/sessions/claim", '{"token":"abc"}', 1793000000)).toBe(VECTOR);
    });

    it("accepts a fresh signature and refuses stale, altered or missing ones", () => {
        const path = "/api/internal/voice-bot/sessions/claim";
        const body = '{"token":"abc"}';
        expect(verifyVoiceBotSignature(SECRET, VECTOR, "POST", path, body, 1793000030)).toBe(true);
        expect(verifyVoiceBotSignature(SECRET, VECTOR, "POST", path, body, 1793000061)).toBe(false); // over a minute old
        expect(verifyVoiceBotSignature(SECRET, VECTOR, "POST", path, '{"token":"abd"}', 1793000000)).toBe(false);
        expect(verifyVoiceBotSignature(SECRET, VECTOR, "POST", "/api/internal/voice-bot/sessions/x/end", body, 1793000000)).toBe(false);
        expect(verifyVoiceBotSignature("another-secret-0123456789abcdef012345", VECTOR, "POST", path, body, 1793000000)).toBe(false);
        expect(verifyVoiceBotSignature(SECRET, null, "POST", path, body, 1793000000)).toBe(false);
        expect(verifyVoiceBotSignature(SECRET, "t=1793000000,v1=zz", "POST", path, body, 1793000000)).toBe(false);
        expect(verifyVoiceBotSignature("", VECTOR, "POST", path, body, 1793000000)).toBe(false);
    });

    it("derives the public address from APP_URL unless one is set", () => {
        const saved = { app: process.env.APP_URL, pub: process.env.VOICE_BOT_PUBLIC_URL };
        process.env.APP_URL = "https://app.example.com";
        delete process.env.VOICE_BOT_PUBLIC_URL;
        expect(voiceBotPublicUrl()).toBe("wss://app.example.com/voice-bot");
        process.env.VOICE_BOT_PUBLIC_URL = "ws://localhost:8765/voice-bot/";
        expect(voiceBotPublicUrl()).toBe("ws://localhost:8765/voice-bot");
        process.env.APP_URL = saved.app;
        if (saved.pub === undefined) delete process.env.VOICE_BOT_PUBLIC_URL; else process.env.VOICE_BOT_PUBLIC_URL = saved.pub;
    });
});

describe("voice for a call (decision 33)", () => {
    const voices = { hi: { provider: "google" as const, voice: "hi-IN-Chirp3-HD-Kore" }, en: { provider: "google" as const, voice: "en-IN-Chirp3-HD-Kore" } };
    const both = { google: true, azure: true };

    it("uses the bot's own voices while the free amount lasts", () => {
        expect(chooseCallVoices(voices, both, { google: 0, azure: 0 })).toEqual({ provider: "google", paid: false, voices });
    });

    it("moves to Azure at 90% of Google's free amount, with a same-gender voice", () => {
        const choice = chooseCallVoices(voices, both, { google: FREE_VOICE_CHARACTERS.google * 0.9, azure: 0 });
        expect(choice).toEqual({ provider: "azure", paid: false, voices: { hi: { provider: "azure", voice: "hi-IN-SwaraNeural" }, en: { provider: "azure", voice: "en-IN-NeerjaNeural" } } });
    });

    it("goes back to Google at the paid rate once both are used, and gives up without Google", () => {
        const used = { google: FREE_VOICE_CHARACTERS.google, azure: FREE_VOICE_CHARACTERS.azure };
        expect(chooseCallVoices(voices, both, used)).toEqual({ provider: "google", paid: true, voices });
        expect(chooseCallVoices(voices, { google: false, azure: true }, used)).toBeNull();
        const azureBot = { hi: { provider: "azure" as const, voice: "hi-IN-MadhurNeural" }, en: { provider: "azure" as const, voice: "en-IN-PrabhatNeural" } };
        expect(chooseCallVoices(azureBot, both, used)).toEqual({ provider: "google", paid: true, voices: { hi: { provider: "google", voice: "hi-IN-Chirp3-HD-Charon" }, en: { provider: "google", voice: "en-IN-Chirp3-HD-Charon" } } });
    });

    it("knows the voices' genders", () => {
        expect(voiceGender("google", "hi-IN-Chirp3-HD-Aoede")).toBe("female");
        expect(voiceGender("google", "hi-IN-Chirp3-HD-Puck")).toBe("male");
        expect(voiceGender("azure", "en-IN-NeerjaNeural")).toBe("female");
        expect(voiceGender("azure", "hi-IN-MadhurNeural")).toBe("male");
    });
});

describe("recorded lines", () => {
    it("keeps only the samples of a WAV file", () => {
        const samples = Buffer.from([1, 2, 3, 4]);
        const header = Buffer.alloc(44);
        header.write("RIFF", 0, "ascii"); header.writeUInt32LE(36 + samples.length, 4); header.write("WAVE", 8, "ascii");
        header.write("fmt ", 12, "ascii"); header.writeUInt32LE(16, 16);
        header.write("data", 36, "ascii"); header.writeUInt32LE(samples.length, 40);
        expect([...stripWavHeader(Buffer.concat([header, samples]))]).toEqual([1, 2, 3, 4]);
        expect([...stripWavHeader(samples)]).toEqual([1, 2, 3, 4]);
    });

    it("agrees Hindi verbs with the voice's gender", () => {
        expect(cannedLines("hi", "female").transfer).toContain("जोड़ रही हूँ");
        expect(cannedLines("hi", "male").transfer).toContain("जोड़ रहा हूँ");
        expect(cannedLines("en", "male").fillers).toHaveLength(3);
    });
});
