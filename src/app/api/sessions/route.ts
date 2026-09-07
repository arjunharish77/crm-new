import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listSessionsForUser } from "@/lib/server/sessions";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const sessions = await listSessionsForUser(user.id);
    return NextResponse.json(
      sessions.map((session) => ({ ...session, isCurrent: session.id === (user as any).sessionId })),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch active sessions", error);
  }
}
