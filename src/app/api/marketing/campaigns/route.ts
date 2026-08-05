import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listMarketingCampaignsForTenant, upsertMarketingCampaignForTenant } from "@/lib/server/marketing-communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listMarketingCampaignsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing campaigns", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Campaign name is required");
    return NextResponse.json(await upsertMarketingCampaignForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save marketing campaign", error);
  }
}
