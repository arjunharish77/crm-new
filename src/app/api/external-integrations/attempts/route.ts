import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { listExternalPushAttemptsForRecord } from "@/lib/repositories/external-integrations-postgres";

// Not gated by the "integrations" permission -- anyone who can already view a Lead/Opportunity
// can see its "last pushed" status, same as any other metadata on the page. Only configuring
// integrations and triggering a push are behind that permission.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const opportunityId = url.searchParams.get("opportunityId");
    const attempts = await listExternalPushAttemptsForRecord(user, { leadId, opportunityId });
    return NextResponse.json(attempts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch integration push history", error);
  }
}
