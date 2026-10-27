import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { addVoiceBotField, createVoiceBot, draftVoiceBotWithClaude, listVoiceBots } from "@/lib/server/voice-bots";

export async function GET(request: Request) {
    return voiceBotRoute(request, "view", async (user) => {
        const archived = new URL(request.url).searchParams.get("archived") === "1";
        return NextResponse.json(await listVoiceBots(user, { archived }));
    });
}

// Create a bot; with `description` and `draftWithClaude`, Claude drafts its conversation and
// fields first (decision 30).
export async function POST(request: Request) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        let draft: Awaited<ReturnType<typeof draftVoiceBotWithClaude>> | null = null;
        if (body.draftWithClaude === true) draft = await draftVoiceBotWithClaude(user, { description: body.description });
        const config: Record<string, unknown> = { description: String(body.description ?? "").slice(0, 500) };
        if (draft) Object.assign(config, {
            persona: draft.persona, goal: draft.goal, rules: draft.rules, openingLine: draft.openingLine, closingLine: draft.closingLine,
            endRule: draft.endRule, transfer: { enabled: true, rule: draft.transferRule, teamId: null, ringSeconds: 25 },
        });
        const bot = await createVoiceBot(user, { name: body.name, config });
        for (const field of draft?.fields ?? []) await addVoiceBotField(user, bot.id, field).catch(() => undefined);
        return NextResponse.json(bot, { status: 201 });
    });
}
