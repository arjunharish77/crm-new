import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { ModuleDependencyError, setTenantModuleStatus } from "@/lib/server/module-entitlements";
import { badRequest, forbidden, moduleDependencyConflict, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; moduleKey: string }> }
) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id, moduleKey } = await params;
    const body = await request.json().catch(() => ({}));
    if (!["ENABLED", "DISABLED", "SUSPENDED", "TRIAL"].includes(body?.status)) return badRequest("Invalid status");
    const result = await setTenantModuleStatus(user, id, moduleKey, body.status, body.reason, { trialEndsAt: typeof body.trialEndsAt === "string" ? body.trialEndsAt : null });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ModuleDependencyError) return moduleDependencyConflict(error.explanation);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MODULE_NOT_FOUND") return badRequest("Unknown module key");
    if (error instanceof Error && error.message === "TRIAL_END_DATE_REQUIRED") return moduleDependencyConflict("Choose a trial end date in the future.", 400);
    if (error instanceof Error && error.message === "CORE_MODULE_CANNOT_BE_DISABLED") return badRequest("Core modules cannot be disabled");
    return serverError("Failed to update tenant module entitlement", error);
  }
}
