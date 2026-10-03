import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCallCampaignsForTenant, createCallCampaignForTenant, listMyCallCampaigns } from "@/lib/server/call-campaigns";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    // ?mine=1: the active campaigns this person can take calls from (Call center page).
    if (new URL(request.url).searchParams.get("mine") === "1") return NextResponse.json(await listMyCallCampaigns(user));
    const campaigns = await listCallCampaignsForTenant(user);
    return NextResponse.json(campaigns);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call campaigns", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Name is required");
    const created = await createCallCampaignForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call campaigns");
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    return serverError("Failed to create call campaign", error);
  }
}
