import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { archiveVoiceBot, getVoiceBot, placeholderWarnings, updateVoiceBot } from "@/lib/server/voice-bots";
import { notFound } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
    return voiceBotRoute(request, "view", async (user) => {
        const bot = await getVoiceBot(user, (await params).id);
        if (!bot) return notFound("Voice bot not found");
        return NextResponse.json({ ...bot, placeholderWarnings: placeholderWarnings(bot.config) });
    });
}

export async function PATCH(request: Request, { params }: Context) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        const bot = await updateVoiceBot(user, (await params).id, { name: body.name, config: body.config, status: body.status });
        return NextResponse.json(bot ? { ...bot, placeholderWarnings: placeholderWarnings(bot.config) } : null);
    });
}

// Archive (restorable from the archived list).
export async function DELETE(request: Request, { params }: Context) {
    return voiceBotRoute(request, "manage", async (user) => {
        await archiveVoiceBot(user, (await params).id);
        return NextResponse.json({ archived: true });
    });
}
