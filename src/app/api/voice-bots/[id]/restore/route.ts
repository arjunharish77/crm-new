import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { restoreVoiceBot } from "@/lib/server/voice-bots";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        await restoreVoiceBot(user, (await params).id);
        return NextResponse.json({ restored: true });
    });
}
