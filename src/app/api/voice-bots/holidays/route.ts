import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { addVoiceBotHoliday, listVoiceBotHolidays } from "@/lib/server/voice-bots";

export async function GET(request: Request) {
    return voiceBotRoute(request, "view", async (user) => NextResponse.json(await listVoiceBotHolidays(user)));
}

export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        return NextResponse.json(await addVoiceBotHoliday(user, { date: body.date, label: body.label }), { status: 201 });
    });
}
