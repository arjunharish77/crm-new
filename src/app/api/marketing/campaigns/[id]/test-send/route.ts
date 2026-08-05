import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { sendMarketingCampaignTestForTenant } from "@/lib/server/marketing-communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.recipient) return badRequest("Test recipient is required");
    return NextResponse.json(await sendMarketingCampaignTestForTenant(user, id, String(body.recipient)));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to queue test send", error);
  }
}
