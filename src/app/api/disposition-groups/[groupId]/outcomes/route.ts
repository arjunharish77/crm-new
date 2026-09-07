import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createDispositionOutcomeForTenant } from "@/lib/server/dispositions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

function hasDispositionAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

export async function POST(request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasDispositionAdminAccess(user)) return forbidden("You don't have permission to manage call dispositions");
    const { groupId } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Name is required");
    const created = await createDispositionOutcomeForTenant(user, groupId, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    if (error instanceof Error && error.message === "DISPOSITION_GROUP_NOT_FOUND") return badRequest("Disposition group not found");
    if (error instanceof Error && error.message === "PARENT_OUTCOME_NOT_FOUND") return badRequest("Parent outcome not found");
    return serverError("Failed to create disposition outcome", error);
  }
}
