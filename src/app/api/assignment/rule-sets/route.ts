import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createDistributionRuleSetForTenant, listDistributionRuleSetsForTenant } from "@/lib/server/admin-modules";

// Distribution rule folders (DistributionRuleSet) -- purely organizational grouping for the
// rule builder/list page.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const entityType = new URL(request.url).searchParams.get("entityType") ?? undefined;
    const ruleSets = await listDistributionRuleSetsForTenant(user, entityType);
    return NextResponse.json(ruleSets);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch distribution rule folders", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Folder name is required");
    const ruleSet = await createDistributionRuleSetForTenant(user, body);
    return NextResponse.json(ruleSet);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Distribution module is disabled for this tenant");
    return serverError("Failed to create distribution rule folder", error);
  }
}
