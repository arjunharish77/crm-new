import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { testVoiceProvider, VOICE_PROVIDERS, type VoiceProvider } from "@/lib/server/voice-providers";
import { badRequest } from "@/lib/server/http";

// Checks a saved key with the provider. Nothing is billed and no call is placed.
export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const provider = String((await readJson(request)).provider ?? "") as VoiceProvider;
        if (!VOICE_PROVIDERS.includes(provider)) return badRequest("Unknown provider");
        return NextResponse.json(await testVoiceProvider(user.tenantId, provider));
    });
}
