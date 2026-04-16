import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createTenantRole, listTenantRoles } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const roles = await listTenantRoles(user.tenantId);
    return NextResponse.json(roles);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch roles");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.permissions) {
      return badRequest("Role name and permissions are required");
    }

    const role = await createTenantRole(user.tenantId, body);
    return NextResponse.json(role);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create role");
  }
}
