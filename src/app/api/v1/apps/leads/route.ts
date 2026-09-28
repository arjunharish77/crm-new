import { NextResponse } from "next/server";
import { MarketplaceAppAuthenticationError, authenticateMarketplaceAppRequest, buildAppScopedActor, hasAppPermission } from "@/lib/server/marketplace-inbound";
import { createLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";
import { prepareIncomingPayload } from "@/lib/server/marketplace-sync";
import { badRequest, conflict, forbidden, marketplaceAppAuthErrorResponse, serverError } from "@/lib/server/http";

// The marketplace-app counterpart to /api/v1/leads -- same underlying repo functions, but
// authenticated against a MarketplaceApp's own id+secret and TenantAppPermissionGrant scopes
// instead of an ApiKey, keeping the two credential systems fully independent per the app's
// own install-approval lifecycle rather than retrofitting the ApiKey routes with a second
// credential type.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const auth = await authenticateMarketplaceAppRequest(request);
    if (!hasAppPermission(auth.permissions, "leads", "read")) {
      return forbidden("This app does not have permission to read leads");
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const result = await listLeadsForTenant(await buildAppScopedActor(auth), page, limit);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    return serverError("Failed to list leads", error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const auth = await authenticateMarketplaceAppRequest(request);
    if (!hasAppPermission(auth.permissions, "leads", "write")) {
      return forbidden("This app does not have permission to create leads");
    }
    const rawParsed = rawBody ? JSON.parse(rawBody) : {};
    // Field mapping (translate the app's own field names back to real CRM fields) and default
    // ownership (fill in an owner the app didn't specify) -- both opt-in via the install's own
    // sync settings, no-ops for an app that never configured them.
    const body = await prepareIncomingPayload(auth.installId, "leads", rawParsed);
    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) return badRequest("name is required");
    const idempotencyKey = request.headers.get("idempotency-key");
    const lead = await createLeadForTenant(await buildAppScopedActor(auth), body, idempotencyKey);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") {
      return conflict("This Idempotency-Key was already used with a different request body");
    }
    return serverError("Failed to create lead", error);
  }
}
