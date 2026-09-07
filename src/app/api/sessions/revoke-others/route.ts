import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { revokeAllOtherSessions } from "@/lib/server/sessions";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const sessionId = (user as any).sessionId as string | null;
    if (!sessionId) return badRequest("No active session context to keep -- log in again first");
    await revokeAllOtherSessions(user.id, sessionId, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to revoke other sessions", error);
  }
}
