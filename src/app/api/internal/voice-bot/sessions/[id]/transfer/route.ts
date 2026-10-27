import { NextResponse } from "next/server";
import { notFound } from "@/lib/server/http";
import { voiceBotServiceRoute } from "@/lib/server/voice-bot-route";
import { requestVoiceBotTransfer } from "@/lib/server/voice-bot-calls";

// The bot service asks for a phone call to be handed to a person (decision 3).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotServiceRoute(request, async (body) => {
        const result = await requestVoiceBotTransfer((await params).id, body);
        return result ? NextResponse.json(result) : notFound();
    });
}
