import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { cancelVoiceBotCall, getVoiceBotCallDetail } from "@/lib/server/voice-bot-calls";

type Params = { params: Promise<{ id: string; callId: string }> };

// One bot call: status, summary, fields, transcript, hand-over and what was done after it.
export async function GET(request: Request, { params }: Params) {
    return voiceBotRoute(request, "view", async (user) => {
        const { id, callId } = await params;
        return NextResponse.json(await getVoiceBotCallDetail(user, id, callId));
    });
}

// Cancels a call still waiting in the queue.
export async function DELETE(request: Request, { params }: Params) {
    return voiceBotRoute(request, "use", async (user) => {
        const { id, callId } = await params;
        await cancelVoiceBotCall(user, id, callId);
        return NextResponse.json({ cancelled: true });
    });
}
