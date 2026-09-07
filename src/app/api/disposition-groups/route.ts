import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listDispositionGroupsForTenant, createDispositionGroupForTenant } from "@/lib/server/dispositions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

function hasDispositionAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const groups = await listDispositionGroupsForTenant(user);
    return NextResponse.json(groups);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch disposition groups", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasDispositionAdminAccess(user)) return forbidden("You don't have permission to manage call dispositions");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Name is required");
    const created = await createDispositionGroupForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    return serverError("Failed to create disposition group", error);
  }
}
