import { NextResponse, after } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { addDocument, processKnowledgeSource } from "@/lib/server/voice-bot-knowledge";

// Uploads a PDF, Word or text file as knowledge; it's read after the upload is answered.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) throw new Error("VOICE_BOT_KNOWLEDGE_FILE_TYPE");
        if (file.size > 10 * 1024 * 1024) throw new Error("VOICE_BOT_KNOWLEDGE_FILE_SIZE");
        const id = await addDocument(user, (await params).id, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, form?.get("tidyWithClaude") === "true");
        after(() => processKnowledgeSource(user.tenantId, id));
        return NextResponse.json({ id }, { status: 202 });
    });
}
