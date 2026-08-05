import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getMarketingCampaignForTenant, upsertMarketingCampaignForTenant } from "@/lib/server/marketing-communications";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const campaign = await getMarketingCampaignForTenant(user, id);
    if (!campaign) return NextResponse.json({ message: "Campaign not found" }, { status: 404 });
    return NextResponse.json(campaign);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing campaign", error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await upsertMarketingCampaignForTenant(user, { ...body, id }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update marketing campaign", error);
  }
}
