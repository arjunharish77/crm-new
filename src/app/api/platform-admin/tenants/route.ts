import { tenantProvisioningSchema } from "@/lib/tenant-provisioning";
import { NextResponse } from "next/server";
import { createTenantWithAdmin, listTenants } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, conflict, forbidden, moduleDependencyConflict, serverError, unauthorized } from "@/lib/server/http";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { validatePasswordStrength } from "@/lib/server/password-policy";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const tenants = await listTenants();
    return NextResponse.json(tenants);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch tenants", error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin(request);
    const parsed = tenantProvisioningSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);
    const body = parsed.data;

    if (!body?.name || !body?.adminName || !body?.adminEmail || !body?.adminPassword) {
      return badRequest("Tenant and admin details are required");
    }

    const policy = await getEffectiveSecurityPolicy(null);
    const strengthErrors = validatePasswordStrength(body.adminPassword, policy);
    if (strengthErrors.length) return badRequest(strengthErrors.join(", "));

    const created = await createTenantWithAdmin(body, actor);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "UNKNOWN_MODULE_SELECTION") return badRequest("The module catalog changed. Reload before creating the tenant.");
    if (error instanceof Error && error.message === "CORE_MODULE_CANNOT_BE_DISABLED") return badRequest("Core modules must remain enabled");
    if (error instanceof Error && error.message.startsWith("MODULE_DEPENDENCY: ")) return moduleDependencyConflict(error.message.slice("MODULE_DEPENDENCY: ".length), 400);
    if (error instanceof Error && error.message === "MODULE_CATALOG_UNAVAILABLE") return badRequest("The module catalog is unavailable. Apply database migrations before provisioning tenants.");
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return conflict("A tenant or admin account already uses these details. Check the admin email before retrying.");
    return serverError("Failed to create tenant", error);
  }
}
