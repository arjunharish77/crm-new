import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateDispositionOutcomeForTenant, deleteDispositionOutcomeForTenant } from "@/lib/server/dispositions";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

function hasDispositionAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasDispositionAdminAccess(user)) return forbidden("You don't have permission to manage call dispositions");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateDispositionOutcomeForTenant(user, id, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update disposition outcome", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasDispositionAdminAccess(user)) return forbidden("You don't have permission to manage call dispositions");
    const { id } = await params;
    await deleteDispositionOutcomeForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete disposition outcome", error);
  }
}
