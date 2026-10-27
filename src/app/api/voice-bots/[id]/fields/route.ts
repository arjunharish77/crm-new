import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { addVoiceBotField } from "@/lib/server/voice-bots";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const field = await addVoiceBotField(user, (await params).id, await readJson(request));
        return NextResponse.json(field, { status: 201 });
    });
}
