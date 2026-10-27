import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { deleteKnowledgeSource, getKnowledgeSource, updateQa } from "@/lib/server/voice-bot-knowledge";

type Params = { params: Promise<{ id: string; sourceId: string }> };

// One knowledge source with the passages made from it.
export async function GET(request: Request, { params }: Params) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, sourceId } = await params;
        return NextResponse.json(await getKnowledgeSource(user, id, sourceId));
    });
}

// Edits a written Q&A.
export async function PATCH(request: Request, { params }: Params) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, sourceId } = await params;
        await updateQa(user, id, sourceId, await readJson(request));
        return NextResponse.json({ saved: true });
    });
}

export async function DELETE(request: Request, { params }: Params) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, sourceId } = await params;
        await deleteKnowledgeSource(user, id, sourceId);
        return NextResponse.json({ deleted: true });
    });
}
