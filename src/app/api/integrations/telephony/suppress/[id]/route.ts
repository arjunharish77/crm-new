import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { removePhoneSuppressionForTenant } from "@/lib/server/communications";

function hasTelephonyAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to manage the do-not-call list");
    const { id } = await params;
    await removePhoneSuppressionForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to remove number from do-not-call list", error);
  }
}
