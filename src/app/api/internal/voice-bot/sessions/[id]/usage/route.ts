import { NextResponse } from "next/server";
import { notFound } from "@/lib/server/http";
import { voiceBotServiceRoute } from "@/lib/server/voice-bot-route";
import { recordVoiceBotSessionUsage } from "@/lib/server/voice-bot-sessions";

// Provider usage during a conversation; the answer says whether Claude's budget is used up.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotServiceRoute(request, async (body) => {
        const result = await recordVoiceBotSessionUsage((await params).id, body);
        return result ? NextResponse.json(result) : notFound();
    });
}
