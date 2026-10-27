import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { voiceBotFieldCatalog } from "@/lib/server/voice-bots";

// The fields a bot can be given as caller details, and the fields its answers can be copied to.
export async function GET(request: Request) {
    return voiceBotRoute(request, "view", async (user) => NextResponse.json(await voiceBotFieldCatalog(user)));
}
