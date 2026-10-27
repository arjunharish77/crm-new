import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { voiceBotLeadSources } from "@/lib/server/voice-bots";

// Lead sources in use, for a bot's "new enquiries" setting.
export async function GET(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => NextResponse.json({ sources: await voiceBotLeadSources(user) }));
}
