import { NextResponse } from "next/server";
import { changeTenantEnvironment } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

const VALID_ENVIRONMENTS = new Set(["PRODUCTION", "SANDBOX", "TEST"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!VALID_ENVIRONMENTS.has(body?.environment)) return badRequest("environment must be PRODUCTION, SANDBOX, or TEST");
    const result = await changeTenantEnvironment(id, body.environment);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TENANT_NOT_FOUND") return badRequest("Tenant not found");
    return serverError("Failed to update tenant environment", error);
  }
}
