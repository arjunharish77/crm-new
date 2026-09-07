import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateCallScriptForTenant, deleteCallScriptForTenant } from "@/lib/server/call-scripts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateCallScriptForTenant(user, id, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call scripts");
    if (error instanceof Error && error.message === "CALL_SCRIPT_NOT_FOUND") return badRequest("Call script not found");
    return serverError("Failed to update call script", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    await deleteCallScriptForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call scripts");
    return serverError("Failed to delete call script", error);
  }
}
