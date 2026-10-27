import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { testKnowledgeQuestion } from "@/lib/server/voice-bot-knowledge";

// "Test a question": what the bot would find for it on a call.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const body = await readJson(request);
        return NextResponse.json(await testKnowledgeQuestion(user, (await params).id, body.question));
    });
}
