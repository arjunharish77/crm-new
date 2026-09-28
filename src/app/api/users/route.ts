import { NextResponse } from "next/server";
import { requireInternalUser, requireTenantAdmin } from "@/lib/server/auth";
import { createTenantScopedUser, listTenantUsers } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";
import { validatePasswordStrength } from "@/lib/server/password-policy";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const users = await listTenantUsers(user.tenantId);
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch users", error);
  }
}

// F02 fix (WP03): creating a user sets its initial roleId -- the same privilege-assignment
// surface as PATCH /api/users/[id], just at creation time instead of update time. Tenant Admin
// only, per the confirmed policy (this route's only real caller is the admin Users page's
// invite-user dialog).
export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.email || !body?.password || !body?.roleId) {
      return badRequest("Name, email, password, and role are required");
    }

    // Gap checklist: "password and authentication policy controls" -- strength requirements
    // (SecurityPolicy.minPasswordLength/requireUppercase/etc) were configurable in the admin UI
    // but nothing ever enforced them anywhere, including here at the one place every password
    // in this app originates from.
    const policy = await getEffectiveSecurityPolicy(user.tenantId);
    const strengthErrors = validatePasswordStrength(body.password, policy);
    if (strengthErrors.length) return badRequest(strengthErrors.join(", "));

    const created = await createTenantScopedUser(user.tenantId, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "ROLE_NOT_FOUND_FOR_TENANT") return badRequest("Selected role was not found for this workspace");
    if (error instanceof Error && error.message === "TEAM_NOT_FOUND_FOR_TENANT") return badRequest("Selected team was not found for this workspace");
    if (error instanceof Error && error.message === "MANAGER_NOT_FOUND_FOR_TENANT") return badRequest("Selected manager was not found for this workspace");
    if (error instanceof Error && error.message === "PERMISSION_TEMPLATE_NOT_FOUND_FOR_TENANT") return badRequest("Selected permission template was not found for this workspace");
    return serverError("Failed to create user", error);
  }
}
