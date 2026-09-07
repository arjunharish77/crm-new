import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { markImpersonationSessionReviewed } from "@/lib/server/sessions";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await markImpersonationSessionReviewed(id, admin.id, body?.note ? String(body.note) : null);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") return badRequest("Session not found");
    return serverError("Failed to mark session reviewed", error);
  }
}
