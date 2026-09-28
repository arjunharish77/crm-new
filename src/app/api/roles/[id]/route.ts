import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteTenantRole, updateTenantRole } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const role = await updateTenantRole(user.tenantId, id, body, { id: user.id, tenantId: user.tenantId });
    return NextResponse.json(role);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT") return badRequest("Selected permission template was not found for this workspace");
    return serverError("Failed to update role", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const { id } = await params;
    await deleteTenantRole(user.tenantId, id, { id: user.id, tenantId: user.tenantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete role", error);
  }
}
