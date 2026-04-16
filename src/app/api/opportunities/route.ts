import { NextResponse } from "next/server";
import {
  createOpportunityForTenant,
  listOpportunitiesForTenant,
} from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");

    const response = await listOpportunitiesForTenant(user, limit);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunities");
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

    console.error("Opportunity create failed", error);
    return serverError("Failed to create opportunity", error);
  }
}
