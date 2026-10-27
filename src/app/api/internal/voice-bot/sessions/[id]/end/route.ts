import { NextResponse, after } from "next/server";
import { notFound } from "@/lib/server/http";
import { voiceBotServiceRoute } from "@/lib/server/voice-bot-route";
import { endVoiceBotSession } from "@/lib/server/voice-bot-sessions";

// The service's report when a conversation ends: transcript, timings, fields and events. For a
// phone call Plivo has already hung up on, the after-call work (summary, activity, mapping,
// retries) starts now; otherwise Plivo's hang-up callback starts it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotServiceRoute(request, async (body) => {
        const result = await endVoiceBotSession((await params).id, body);
        if (!result) return notFound();
        if (result.voiceBotCallId && !result.alreadyEnded) {
            const { findVoiceBotCall, processVoiceBotCall } = await import("@/lib/server/voice-bot-calls");
            const call = await findVoiceBotCall(result.tenantId, result.voiceBotCallId);
            if (call && call.status !== "IN_PROGRESS" && call.status !== "DIALING") after(() => processVoiceBotCall(result.tenantId, call.id).then(() => undefined).catch(() => undefined));
        }
        return NextResponse.json({ ok: true });
    });
}
