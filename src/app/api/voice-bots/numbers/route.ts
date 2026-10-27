import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { listVoiceBotNumbers } from "@/lib/server/voice-bots";

export async function GET(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => NextResponse.json(await listVoiceBotNumbers(user)));
}
