import { NextResponse, after } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { markForRefresh, processKnowledgeSource } from "@/lib/server/voice-bot-knowledge";

// Reads a source again now (web pages and the catalogue are also refreshed daily).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; sourceId: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, sourceId } = await params;
        await markForRefresh(user, id, sourceId);
        after(() => processKnowledgeSource(user.tenantId, sourceId));
        return NextResponse.json({ refreshing: true }, { status: 202 });
    });
}
