import { NextResponse } from "next/server";
import { readJson, voiceBotRoute } from "@/lib/server/voice-bot-route";
import { deleteVoiceBotField, updateVoiceBotField } from "@/lib/server/voice-bots";

type Context = { params: Promise<{ id: string; fieldId: string }> };

export async function PATCH(request: Request, { params }: Context) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, fieldId } = await params;
        await updateVoiceBotField(user, id, fieldId, await readJson(request));
        return NextResponse.json({ updated: true });
    });
}

export async function DELETE(request: Request, { params }: Context) {
    return voiceBotRoute(request, "manage", async (user) => {
        const { id, fieldId } = await params;
        await deleteVoiceBotField(user, id, fieldId);
        return NextResponse.json({ deleted: true });
    });
}
