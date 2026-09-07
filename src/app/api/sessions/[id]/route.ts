import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { revokeSession } from "@/lib/server/sessions";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await revokeSession(user.id, id, user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") return badRequest("Session not found");
    return serverError("Failed to revoke session", error);
  }
}
