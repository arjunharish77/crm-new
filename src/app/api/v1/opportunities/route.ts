import { NextResponse } from "next/server";
import { ApiKeyAuthenticationError, authenticateApiKeyRequest, hasApiKeyPermission } from "@/lib/server/api-keys";
import { createOpportunityForTenant, listOpportunitiesForTenant } from "@/lib/server/crm";
import { apiKeyAuthErrorResponse, badRequest, forbidden, serverError } from "@/lib/server/http";

// Second endpoint in the developer-facing API surface, alongside /api/v1/leads -- same
// API-key-only auth, permission-scoping, rate-limit, IP-allowlist, and last-used tracking via
// authenticateApiKeyRequest, gated on the key's own "opportunities" permission scope rather
// than "leads" so the two modules are independently grantable.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { apiKey, tenantId } = await authenticateApiKeyRequest(request, { method: "GET", path: url.pathname, rawBody: "" });
    if (!hasApiKeyPermission(apiKey.permissions, "opportunities", "read")) {
      return forbidden("This API key does not have permission to read opportunities");
    }
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const result = await listOpportunitiesForTenant({ id: apiKey.id, tenantId }, limit);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthenticationError) return apiKeyAuthErrorResponse(error.reason);
    return serverError("Failed to list opportunities", error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const rawBody = await request.text();
    const { apiKey, tenantId } = await authenticateApiKeyRequest(request, { method: "POST", path: url.pathname, rawBody });
    if (!hasApiKeyPermission(apiKey.permissions, "opportunities", "create")) {
      return forbidden("This API key does not have permission to create opportunities");
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
    if (!body?.title || typeof body.title !== "string" || !body.title.trim()) return badRequest("title is required");
    const opportunity = await createOpportunityForTenant({ id: apiKey.id, tenantId }, body);
    return NextResponse.json(opportunity, { status: 201 });
  } catch (error) {
    if (error instanceof ApiKeyAuthenticationError) return apiKeyAuthErrorResponse(error.reason);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Opportunities are not enabled for this workspace");
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    return serverError("Failed to create opportunity", error);
  }
}
