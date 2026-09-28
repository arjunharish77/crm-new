import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import {
  deletePermissionTemplateForTenant,
  updatePermissionTemplateForTenant,
} from "@/lib/server/admin";
import { isPrivilegedActionApprovalRequired, createPrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.permissions) return badRequest("Template name and permissions are required");

    // Gap checklist: "privileged action controls" -- opt-in per tenant (off by default).
    if (await isPrivilegedActionApprovalRequired("PERMISSION_TEMPLATE_UPDATE", user.tenantId)) {
      const { id: requestId } = await createPrivilegedActionRequest(user, {
        tenantId: user.tenantId,
        actionType: "PERMISSION_TEMPLATE_UPDATE",
        targetType: "PERMISSION_TEMPLATE",
        targetId: id,
        payload: body,
      });
      return NextResponse.json({ pendingApproval: true, requestId });
    }

    const template = await updatePermissionTemplateForTenant(user.tenantId, id, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update permission template", error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await context.params;
    await deletePermissionTemplateForTenant(user.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete permission template", error);
  }
}
