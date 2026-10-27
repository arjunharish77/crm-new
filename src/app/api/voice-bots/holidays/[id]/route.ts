import { NextResponse } from "next/server";
import { voiceBotRoute } from "@/lib/server/voice-bot-route";
import { deleteVoiceBotHoliday } from "@/lib/server/voice-bots";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    return voiceBotRoute(request, "manage", async (user) => {
        await deleteVoiceBotHoliday(user, (await params).id);
        return NextResponse.json({ deleted: true });
    });
}
