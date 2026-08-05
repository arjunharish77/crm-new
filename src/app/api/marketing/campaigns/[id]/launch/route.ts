import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { launchMarketingCampaignForTenant } from "@/lib/server/marketing-communications";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    return NextResponse.json(await launchMarketingCampaignForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to launch campaign", error);
  }
}
