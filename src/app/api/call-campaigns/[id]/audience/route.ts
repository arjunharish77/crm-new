import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { addAudienceToCallCampaign } from "@/lib/server/call-campaigns";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const result = await addAudienceToCallCampaign(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call campaigns");
    if (error instanceof Error && error.message === "CALL_CAMPAIGN_NOT_FOUND") return badRequest("Call campaign not found");
    return serverError("Failed to add audience to call campaign", error);
  }
}
