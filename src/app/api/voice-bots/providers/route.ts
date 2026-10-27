import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { getVoiceProviderSettings, saveVoiceProviderSettings } from "@/lib/server/voice-providers";

export async function GET(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => NextResponse.json(await getVoiceProviderSettings(user.tenantId)));
}

export async function PUT(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        return NextResponse.json(await saveVoiceProviderSettings(user.tenantId, user.id, {
            groqKey: body.groqKey, claudeKey: body.claudeKey, googleKey: body.googleKey, azureKey: body.azureKey,
            azureRegion: body.azureRegion, claudeMonthlyCapUsd: body.claudeMonthlyCapUsd,
            remove: Array.isArray(body.remove) ? body.remove.filter((item: unknown) => ["groq", "claude", "google", "azure"].includes(String(item))) : undefined,
        }));
    });
}
