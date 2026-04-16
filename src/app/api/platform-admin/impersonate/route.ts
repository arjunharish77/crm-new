import { NextResponse } from "next/server";
import { impersonateTenantUser } from "@/lib/server/admin";
import { forbidden, serverError, unauthorized, badRequest } from "@/lib/server/http";
import { requirePlatformAdmin } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const adminUser = await requirePlatformAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.userId || !body?.tenantId) {
      return badRequest("userId and tenantId are required");
    }
    const result = await impersonateTenantUser(adminUser.id, body.tenantId, body.userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to impersonate user");
  }
}
