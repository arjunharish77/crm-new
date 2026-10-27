import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { voiceBotDashboard } from "@/lib/server/voice-bot-stats";

// The voice bot dashboard: ?days=7|30|90 and, for one bot's page, ?botId=.
export async function GET(request: Request) {
    return voiceBotRoute(request, "view", async (user) => {
        const params = new URL(request.url).searchParams;
        return NextResponse.json(await voiceBotDashboard(user, { days: Number(params.get("days") ?? 30), botId: params.get("botId") }));
    });
}
