import { NextResponse } from "next/server";
import { getTenantFeatureFlags, updateTenantFeatureFlags } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { ModuleDependencyError, setTenantModuleStatus } from "@/lib/server/module-entitlements";
import { MODULE_FEATURE_KEYS } from "@/lib/tenant-provisioning";
import { badRequest, forbidden, moduleDependencyConflict, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(request);
    const { id } = await params;
    const flags = await getTenantFeatureFlags(id);
    return NextResponse.json(flags);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch feature flags", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return badRequest("Feature flags payload is required");
    }
    // Six flags became modules (decision 15). Setting one here switches the module instead, with
    // the module's dependency checks and audit; only the remaining flags are stored as flags.
    const patch = { ...(body as Record<string, unknown>) };
    for (const [moduleKey, flag] of Object.entries(MODULE_FEATURE_KEYS)) {
      if (typeof patch[flag] !== "boolean") continue;
      await setTenantModuleStatus(admin, id, moduleKey, patch[flag] ? "ENABLED" : "DISABLED", "Changed through the feature flags API");
      delete patch[flag];
    }
    const flags = Object.keys(patch).length ? await updateTenantFeatureFlags(id, patch) : await getTenantFeatureFlags(id);
    return NextResponse.json(flags);
  } catch (error) {
    if (error instanceof ModuleDependencyError) return moduleDependencyConflict(error.explanation);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update feature flags", error);
  }
}
