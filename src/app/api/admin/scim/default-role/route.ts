import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getDefaultScimRoleId, setDefaultScimRoleId } from "@/lib/server/scim";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return unauthorized();
    const defaultScimRoleId = await getDefaultScimRoleId(user.tenantId);
    return NextResponse.json({ defaultScimRoleId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to load default SCIM role", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return unauthorized();
    const body = await request.json().catch(() => null);
    if (!body || typeof body.defaultScimRoleId === "undefined") return badRequest("defaultScimRoleId is required (null to clear)");
    await setDefaultScimRoleId(user.tenantId, body.defaultScimRoleId || null);
    return NextResponse.json({ defaultScimRoleId: body.defaultScimRoleId || null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update default SCIM role", error);
  }
}
