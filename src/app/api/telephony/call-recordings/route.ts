import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCallRecordingsForTenant } from "@/lib/server/call-recordings";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const opportunityId = url.searchParams.get("opportunityId");
    if (!leadId && !opportunityId) return badRequest("leadId or opportunityId is required");
    const recordings = await listCallRecordingsForTenant(user, { leadId, opportunityId });
    return NextResponse.json(recordings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "LEAD_NOT_FOUND") return badRequest("Lead not found or not accessible");
    if (error instanceof Error && error.message === "OPPORTUNITY_NOT_FOUND") return badRequest("Opportunity not found or not accessible");
    return serverError("Failed to fetch call recordings", error);
  }
}
