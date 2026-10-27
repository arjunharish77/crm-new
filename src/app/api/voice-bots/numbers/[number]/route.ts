import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { setVoiceBotNumber } from "@/lib/server/voice-bots";

// Who answers a number: OWNER (people), BOT, or OWNER_THEN_BOT.
export async function PUT(request: Request, { params }: { params: Promise<{ number: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        await setVoiceBotNumber(user, decodeURIComponent((await params).number), { mode: body.mode, botId: body.botId });
        return NextResponse.json({ saved: true });
    });
}
