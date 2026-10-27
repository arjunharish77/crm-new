import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { listVoices } from "@/lib/server/voice-providers";
import { badRequest } from "@/lib/server/http";

// Indian Hindi or English voices from Google (Chirp 3 HD) or Azure (neural).
export async function GET(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const params = new URL(request.url).searchParams;
        const provider = params.get("provider");
        const language = params.get("language");
        if ((provider !== "google" && provider !== "azure") || (language !== "hi" && language !== "en")) return badRequest("Choose a provider and language");
        return NextResponse.json(await listVoices(user.tenantId, provider, language));
    });
}
