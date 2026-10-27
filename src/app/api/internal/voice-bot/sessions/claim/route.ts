import { NextResponse } from "next/server";
import { notFound } from "@/lib/server/http";
import { voiceBotServiceRoute } from "@/lib/server/voice-bot-route";
import { claimVoiceBotSession } from "@/lib/server/voice-bot-sessions";

// The bot service claims a conversation with the token it was connected with (single use).
export async function POST(request: Request) {
    return voiceBotServiceRoute(request, async (body) => {
        const session = await claimVoiceBotSession(String(body.token ?? ""));
        return session ? NextResponse.json(session, { headers: { "Cache-Control": "no-store" } }) : notFound();
    });
}
