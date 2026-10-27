import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { catalogProgramsForPicker } from "@/lib/server/voice-bot-knowledge";

// Catalogue programs a bot can be given as knowledge.
export async function GET(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => NextResponse.json({ programs: await catalogProgramsForPicker(user) }));
}
