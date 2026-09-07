import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { resetMfaForUserAsAdmin } from "@/lib/server/mfa";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// The "lost my phone (and my backup codes)" support flow -- strips MFA enrollment, backup
// codes, and trusted devices for the target user so they can log in with just their password
// and re-enroll. Scoped to the admin's own tenant the same way every other admin/users/[id]/*
// route in this app is (see sessions/[sessionId]/route.ts for the identical pattern).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireTenantAdmin(request);
    if (!admin.tenantId) return badRequest("A tenant context is required");
    const { id } = await params;
    await resetMfaForUserAsAdmin(admin, id, admin.tenantId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return badRequest("User not found");
    return serverError("Failed to reset MFA", error);
  }
}
