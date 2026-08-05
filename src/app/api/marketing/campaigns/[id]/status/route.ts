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
    return serverError("Failed to update campaign status", error);
  }
}
