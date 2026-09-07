import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { revokeSessionAsAdmin } from "@/lib/server/sessions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const admin = await requireTenantAdmin(request);
    if (!admin.tenantId) return badRequest("A tenant context is required");
    const { id, sessionId } = await params;
    await revokeSessionAsAdmin(admin.tenantId, id, sessionId, admin.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") return badRequest("Session not found");
    return serverError("Failed to revoke session", error);
  }
}
