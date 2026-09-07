import { NextResponse } from "next/server";
import { MarketplaceAppAuthenticationError, authenticateMarketplaceAppRequest, hasAppPermission } from "@/lib/server/marketplace-inbound";
import { createOpportunityForTenant, listOpportunitiesForTenant } from "@/lib/server/crm";
import { prepareIncomingPayload } from "@/lib/server/marketplace-sync";
import { badRequest, forbidden, marketplaceAppAuthErrorResponse, serverError } from "@/lib/server/http";

// The marketplace-app counterpart to /api/v1/opportunities -- see /api/v1/apps/leads for why
// this is a separate route rather than a dual-credential-type fallback on the ApiKey routes.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { appId, tenantId, permissions } = await authenticateMarketplaceAppRequest(request);
    if (!hasAppPermission(permissions, "opportunities", "read")) {
      return forbidden("This app does not have permission to read opportunities");
    }
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const result = await listOpportunitiesForTenant({ id: appId, tenantId }, limit);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    return serverError("Failed to list opportunities", error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const { appId, tenantId, installId, permissions } = await authenticateMarketplaceAppRequest(request);
    if (!hasAppPermission(permissions, "opportunities", "write")) {
      return forbidden("This app does not have permission to create opportunities");
    }
    const rawParsed = rawBody ? JSON.parse(rawBody) : {};
    const body = await prepareIncomingPayload(installId, "opportunities", rawParsed);
    if (!body?.title || typeof body.title !== "string" || !body.title.trim()) return badRequest("title is required");
    const opportunity = await createOpportunityForTenant({ id: appId, tenantId }, body);
    return NextResponse.json(opportunity, { status: 201 });
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Opportunities are not enabled for this workspace");
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    return serverError("Failed to create opportunity", error);
  }
}
