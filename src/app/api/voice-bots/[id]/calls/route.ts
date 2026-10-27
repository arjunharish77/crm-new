import { NextResponse, after } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { dispatchVoiceBotCalls, listVoiceBotCalls, queueVoiceBotCalls } from "@/lib/server/voice-bot-calls";

// The bot's calls, newest first.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    // ?toListen=1: only calls the quality review flagged for a person to listen to.
    const toListen = new URL(request.url).searchParams.get("toListen") === "1";
    return voiceBotRoute(request, "view", async (user) => NextResponse.json({ calls: await listVoiceBotCalls(user, (await params).id, { toListen }) }));
}

// Queues bot calls to leads or opportunities (more than one needs the bulk switch).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "use", async (user) => {
        const body = await readJson(request);
        const targets = Array.isArray(body.targets) ? body.targets : [{ leadId: body.leadId ?? null, opportunityId: body.opportunityId ?? null }];
        const result = await queueVoiceBotCalls(user, (await params).id, { targets });
        if (result.queued) after(() => dispatchVoiceBotCalls({ tenantId: user.tenantId }).catch(() => undefined));
        return NextResponse.json(result, { status: 202 });
    });
}
