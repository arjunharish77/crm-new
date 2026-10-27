import { requireCurrentUser } from "@/lib/server/auth";
import { readCallRecordingForTenant } from "@/lib/server/call-recordings";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const action = new URL(request.url).searchParams.get("action") === "DOWNLOAD" ? "DOWNLOAD" : "PLAY";
    const bytes = await readCallRecordingForTenant(user, id, action);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${action === "DOWNLOAD" ? "attachment" : "inline"}; filename="call-${id}.mp3"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return new Response("Unauthorized", { status: 401 });
    if (error instanceof Error && error.message === "FORBIDDEN") return new Response("Forbidden", { status: 403 });
    if (error instanceof Error && ["CALL_LOG_NOT_FOUND", "RECORDING_NOT_AVAILABLE", "RECORDING_NOT_LOCAL", "RECORDING_EXPIRED"].includes(error.message)) return new Response("Recording unavailable", { status: 404 });
    return new Response("Recording unavailable", { status: 500 });
  }
}
