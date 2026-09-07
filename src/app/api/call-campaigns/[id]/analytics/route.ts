import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCallCampaignAnalyticsForTenant } from "@/lib/server/call-campaigns";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const analytics = await getCallCampaignAnalyticsForTenant(user, id);
    return NextResponse.json(analytics);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CALL_CAMPAIGN_NOT_FOUND") return badRequest("Call campaign not found");
    return serverError("Failed to fetch call campaign analytics", error);
  }
}
