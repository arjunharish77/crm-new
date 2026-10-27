import { NextResponse } from "next/server";
import { notFound } from "@/lib/server/http";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { getVoiceBotSession } from "@/lib/server/voice-bot-sessions";

// A test call's result: transcript, reply times, fields and events.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, sessionId } = await params;
        const session = await getVoiceBotSession(user, id, sessionId);
        return session ? NextResponse.json(session) : notFound();
    });
}
