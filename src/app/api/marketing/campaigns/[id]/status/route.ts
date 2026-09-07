import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateMarketingCampaignStatusForTenant } from "@/lib/server/marketing-communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

const ALLOWED = new Set(["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "RUNNING", "COMPLETED", "PAUSED", "CANCELLED"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = String(body.status ?? "").toUpperCase();
    if (!ALLOWED.has(status)) return badRequest("Valid status is required");
    return NextResponse.json(await updateMarketingCampaignStatusForTenant(user, id, status as any));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Marketing Communications module is disabled for this tenant");
    if (error instanceof Error && error.message.startsWith("INVALID_CAMPAIGN_TRANSITION")) return badRequest(error.message.replace("INVALID_CAMPAIGN_TRANSITION: ", "Cannot move a campaign from "));
    if (error instanceof Error && error.message === "MARKETING_CAMPAIGN_NOT_FOUND") return NextResponse.json({ message: "Campaign not found" }, { status: 404 });
    return serverError("Failed to update campaign status", error);
  }
}
