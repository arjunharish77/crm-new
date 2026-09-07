import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { reorderDispositionGroupsForTenant } from "@/lib/server/dispositions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

function hasDispositionAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasDispositionAdminAccess(user)) return forbidden("You don't have permission to manage call dispositions");
    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return badRequest("A non-empty ids array is required");
    await reorderDispositionGroupsForTenant(user, ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to reorder disposition groups", error);
  }
}
