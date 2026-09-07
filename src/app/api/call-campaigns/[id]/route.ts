import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCallCampaignForTenant, updateCallCampaignForTenant, deleteCallCampaignForTenant } from "@/lib/server/call-campaigns";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const campaign = await getCallCampaignForTenant(user, id);
    return NextResponse.json(campaign);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CALL_CAMPAIGN_NOT_FOUND") return badRequest("Call campaign not found");
    return serverError("Failed to fetch call campaign", error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateCallCampaignForTenant(user, id, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call campaigns");
    if (error instanceof Error && error.message === "CALL_CAMPAIGN_NOT_FOUND") return badRequest("Call campaign not found");
    if (error instanceof Error && error.message === "INVALID_STATUS") return badRequest("Invalid status");
    return serverError("Failed to update call campaign", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    await deleteCallCampaignForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call campaigns");
    return serverError("Failed to delete call campaign", error);
  }
}
