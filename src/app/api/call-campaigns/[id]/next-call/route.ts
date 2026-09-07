import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getNextCampaignCallForAgent } from "@/lib/server/call-campaigns";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const next = await getNextCampaignCallForAgent(user, id);
    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to work this campaign");
    if (error instanceof Error && error.message === "CALL_CAMPAIGN_NOT_FOUND") return badRequest("Call campaign not found");
    if (error instanceof Error && error.message === "CAMPAIGN_NOT_ACTIVE") return badRequest("This campaign isn't active");
    return serverError("Failed to fetch next campaign call", error);
  }
}
