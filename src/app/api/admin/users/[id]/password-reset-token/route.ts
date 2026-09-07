import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { adminGeneratePasswordResetToken } from "@/lib/server/password-policy";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Generates a one-hour, single-use password-reset token for the admin to copy and share with
// the user manually (this app has no system email sender -- see migration 0079's comment).
// Same tenant-scoping pattern as every other admin/users/[id]/* route.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireTenantAdmin(request);
    if (!admin.tenantId) return badRequest("A tenant context is required");
    const { id } = await params;
    const result = await adminGeneratePasswordResetToken(admin, id, admin.tenantId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return badRequest("User not found");
    return serverError("Failed to generate password reset token", error);
  }
}
