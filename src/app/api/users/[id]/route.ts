import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateTenantScopedUser } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// F02 fix (WP03): this route mutates roleId/team/manager/permissionTemplate/status -- i.e. it
// IS the user-administration surface, not a self-profile-edit surface (confirmed: the only
// caller in this app is the admin Users management page). Per the confirmed policy, user/role
// administration is Tenant Admin only, with no delegated permission-template override -- so
// this is a hard requireTenantAdmin gate, not a finer-grained capability check.
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
    const updated = await updateTenantScopedUser(user.tenantId, id, body, { id: user.id, tenantId: user.tenantId });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "ROLE_NOT_FOUND_FOR_TENANT") return badRequest("Selected role was not found for this workspace");
    if (error instanceof Error && error.message === "TEAM_NOT_FOUND_FOR_TENANT") return badRequest("Selected team was not found for this workspace");
    if (error instanceof Error && error.message === "MANAGER_NOT_FOUND_FOR_TENANT") return badRequest("Selected manager was not found for this workspace");
    if (error instanceof Error && error.message === "PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT") return badRequest("Selected permission template was not found for this workspace");
    return serverError("Failed to update user", error);
  }
}
