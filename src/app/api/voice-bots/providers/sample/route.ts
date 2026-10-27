import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { synthesizeSample } from "@/lib/server/voice-providers";
import { badRequest } from "@/lib/server/http";

// A short MP3 of a voice reading the given text ("Play sample").
export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        if ((body.provider !== "google" && body.provider !== "azure") || (body.language !== "hi" && body.language !== "en")) return badRequest("Choose a provider and language");
        const audio = await synthesizeSample(user.tenantId, body.provider, String(body.voice ?? ""), body.language, String(body.text ?? ""));
        return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
    });
}
