import { NextResponse, after } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { dispatchVoiceBotCalls, queueTestPhoneCall } from "@/lib/server/voice-bot-calls";

// "Call my phone": the bot calls the tester's phone with its saved settings.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        const result = await queueTestPhoneCall(user, (await params).id, body.phone);
        after(() => dispatchVoiceBotCalls({ tenantId: user.tenantId }).catch(() => undefined));
        return NextResponse.json(result, { status: 202 });
    });
}
