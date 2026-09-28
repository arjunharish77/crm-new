import { NextResponse } from "next/server";
import { requireInternalUser, requireTenantAdmin } from "@/lib/server/auth";
import { createTenantRole, listTenantRoles } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// F02 fix (WP03): listing roles (e.g. for a picker) stays available to any internal user, but
// creating a role -- which can grant recordAccess:"ALL" / modules.admin:"full", i.e. mint a new
// tenant-admin-equivalent role -- is Tenant Admin only, per the confirmed policy.
export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const roles = await listTenantRoles(user.tenantId);
    return NextResponse.json(roles);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch roles", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.permissions) {
      return badRequest("Role name and permissions are required");
    }

    const role = await createTenantRole(user.tenantId, body, { id: user.id, tenantId: user.tenantId });
    return NextResponse.json(role);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT") return badRequest("Selected permission template was not found for this workspace");
    return serverError("Failed to create role", error);
  }
}
