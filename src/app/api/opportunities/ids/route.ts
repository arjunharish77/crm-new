import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { listOpportunityIdsForTenant } from "@/lib/repositories/opportunities-postgres";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Ids of every opportunity matching the list's filters, for "select all N matching" bulk actions.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { searchParams } = new URL(request.url);
    const filters = searchParams.get("filters");
    let parsedFilters = null;
    try {
      parsedFilters = filters ? JSON.parse(filters) : null;
    } catch {
      return badRequest("Filters must be valid JSON");
    }
    return NextResponse.json(await listOpportunityIdsForTenant(user, parsedFilters, searchParams.get("opportunityTypeId"), 5000, searchParams.get("q")));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to list opportunity ids", error);
  }
}
