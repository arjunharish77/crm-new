import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { dismissOnboardingChecklistForTenant } from "@/lib/repositories/onboarding-readiness-postgres";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    await dismissOnboardingChecklistForTenant(user);
    return NextResponse.json({ dismissed: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return forbidden("Tenant context required");
    return serverError("Failed to dismiss onboarding checklist", error);
  }
}
