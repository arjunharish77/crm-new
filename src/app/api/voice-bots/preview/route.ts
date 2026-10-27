import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { previewVoiceBot } from "@/lib/server/voice-bots";

// The bot's lines filled from a real lead or opportunity (only what the user may see).
export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        return NextResponse.json(await previewVoiceBot(user, body.config, { leadId: body.leadId ?? null, opportunityId: body.opportunityId ?? null }));
    });
}
