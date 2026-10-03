import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, moduleDependencyConflict, serverError, unauthorized } from "@/lib/server/http";
import { requestModuleAccess } from "@/lib/server/module-access";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body.moduleKey !== "string") return badRequest("moduleKey is required");
    if (body.message != null && (typeof body.message !== "string" || body.message.length > 1000)) return badRequest("message must be text up to 1000 characters");
    return NextResponse.json(await requestModuleAccess(user, body.moduleKey, body.message), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MODULE_NOT_FOUND") return badRequest("Unknown module");
    if (error instanceof Error && error.message === "MODULE_ALREADY_AVAILABLE") return moduleDependencyConflict("This module is already available to your workspace.");
    if (error instanceof Error && error.message === "MODULE_REQUEST_ALREADY_PENDING") return moduleDependencyConflict("A request for this module is already pending.");
    return serverError("Failed to request module access", error);
  }
}
