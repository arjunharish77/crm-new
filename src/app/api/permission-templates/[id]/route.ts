import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  deletePermissionTemplateForTenant,
  updatePermissionTemplateForTenant,
} from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.permissions) return badRequest("Template name and permissions are required");
    const template = await updatePermissionTemplateForTenant(user.tenantId, id, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update permission template", error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await context.params;
    await deletePermissionTemplateForTenant(user.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete permission template", error);
  }
}
