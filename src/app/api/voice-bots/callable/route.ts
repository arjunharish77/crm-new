import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { listCallableVoiceBots } from "@/lib/server/voice-bots";

// Live bots the user can start calls with.
export async function GET(request: Request) {
    return voiceBotRoute(request, "use", async (user) => NextResponse.json({ bots: await listCallableVoiceBots(user) }));
}
