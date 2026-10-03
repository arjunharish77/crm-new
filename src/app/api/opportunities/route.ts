import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import {
  createOpportunityForTenant,
  listOpportunitiesForTenantByType,
} from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const page = Number(searchParams.get("page") ?? "1");
    const opportunityTypeId = searchParams.get("opportunityTypeId");
    const filters = searchParams.get("filters");
    let parsedFilters = null;
    try {
      parsedFilters = filters ? JSON.parse(filters) : null;
    } catch {
      return badRequest("Filters must be valid JSON");
    }
    // Search and sort (UI/UX plan Phase 2), as on the leads list.
    const sortId = searchParams.get("sort");
    const response = await listOpportunitiesForTenantByType(user, limit, opportunityTypeId, parsedFilters, page, {
      search: searchParams.get("q"),
      sort: sortId ? { id: sortId, desc: searchParams.get("dir") !== "asc" } : null,
      // Smart Views: refuse a filter the server can't apply rather than widen the result.
      strictFilters: searchParams.get("strict") === "1",
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunities", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);

    if (!payload?.title || !payload?.leadId || !payload?.opportunityTypeId) {
      return badRequest("Title, lead, and opportunity type are required");
    }

    const opportunity = await createOpportunityForTenant(user, payload);
    return NextResponse.json(opportunity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Opportunities is not enabled for this workspace");
    }

    console.error("Opportunity create failed", error);
    return serverError("Failed to create opportunity", error);
  }
}
