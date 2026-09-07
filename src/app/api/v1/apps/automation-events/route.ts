import { NextResponse } from "next/server";
import { MarketplaceAppAuthenticationError, authenticateMarketplaceAppRequest, fireAppAutomationTrigger } from "@/lib/server/marketplace-inbound";
import { badRequest, forbidden, marketplaceAppAuthErrorResponse, serverError } from "@/lib/server/http";

// Gap checklist Module 16's app event bus, "triggers" half -- the inbound counterpart to
// call_app_action's outbound direction, letting an installed app fire a named event that a
// tenant's own automations can listen for (trigger.type = "APP_EVENT"). Same Bearer <appId>.
// <secret> credential shape as every other /api/v1/apps/** route.
export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const { appId, tenantId, permissions } = await authenticateMarketplaceAppRequest(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    if (typeof body?.eventType !== "string" || !body.eventType.trim()) return badRequest("eventType is required");
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
    const results = await fireAppAutomationTrigger({ appId, tenantId, permissions }, body.eventType, payload);
    return NextResponse.json({ matchedAutomations: results.length, results });
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    if (error instanceof Error && error.message === "AUTOMATIONS_WRITE_PERMISSION_REQUIRED") {
      return forbidden("This app does not have permission to trigger automations");
    }
    if (error instanceof Error && error.message === "EVENT_NAME_REQUIRED") return badRequest("eventType is required");
    return serverError("Failed to fire automation trigger", error);
  }
}
