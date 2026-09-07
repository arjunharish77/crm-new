import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getOnboardingReadinessForTenant } from "@/lib/repositories/onboarding-readiness-postgres";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 10's "guided onboarding and demo mode" item, "module readiness checklist"
// / "first-run setup tasks" -- tenant-admin-only, since every checklist item (invite team,
// connect a channel, configure a pipeline) is itself an admin action.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const readiness = await getOnboardingReadinessForTenant(user);
    return NextResponse.json(readiness);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return forbidden("Tenant context required");
    return serverError("Failed to fetch onboarding readiness", error);
  }
}
