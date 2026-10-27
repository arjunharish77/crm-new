import { NextResponse, after } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { addQa, addWebsite, listKnowledge, processKnowledgeSource, setCatalogPrograms } from "@/lib/server/voice-bot-knowledge";

// A bot's knowledge sources (voice bot plan wave D).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => NextResponse.json(await listKnowledge(user, (await params).id)));
}

// Adds a written Q&A (ready at once), a web page or the catalogue programs (read after answering).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const botId = (await params).id;
        const body = await readJson(request);
        if (body.kind === "QA") {
            const id = await addQa(user, botId, body);
            return NextResponse.json({ id }, { status: 201 });
        }
        const id = body.kind === "WEBSITE" ? await addWebsite(user, botId, body) : body.kind === "CATALOG" ? await setCatalogPrograms(user, botId, body.programIds) : (() => { throw new Error("VOICE_BOT_KNOWLEDGE_KIND_INVALID"); })();
        if (id) after(() => processKnowledgeSource(user.tenantId, id));
        return NextResponse.json({ id }, { status: id ? 202 : 200 });
    });
}
