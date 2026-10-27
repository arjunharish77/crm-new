import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { createTestSession } from "@/lib/server/voice-bot-sessions";

// Start a browser test call with the bot's saved settings.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        const session = await createTestSession(user, (await params).id, {
            leadId: typeof body.leadId === "string" && body.leadId ? body.leadId : null,
            opportunityId: typeof body.opportunityId === "string" && body.opportunityId ? body.opportunityId : null,
        });
        return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
    });
}
