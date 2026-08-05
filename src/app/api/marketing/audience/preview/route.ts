import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { previewMarketingCampaignAudienceForTenant } from "@/lib/server/marketing-communications";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await previewMarketingCampaignAudienceForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to preview audience", error);
  }
}
