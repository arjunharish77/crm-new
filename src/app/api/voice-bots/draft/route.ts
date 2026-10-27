import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { draftVoiceBotWithClaude } from "@/lib/server/voice-bots";

// Claude drafts a bot's conversation and fields from a description (nothing is saved).
export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        return NextResponse.json(await draftVoiceBotWithClaude(user, { description: body.description, callerDetails: Array.isArray(body.callerDetails) ? body.callerDetails.map(String) : undefined }));
    });
}
