import { NextResponse } from "next/server";
import { ApiKeyAuthenticationError, authenticateApiKeyRequest, hasApiKeyPermission } from "@/lib/server/api-keys";
import { createLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";
import { apiKeyAuthErrorResponse, badRequest, forbidden, serverError } from "@/lib/server/http";

// First real endpoint in this app's new developer-facing API surface (see the "API management
// console" checklist item) -- authenticated exclusively via API key (no session/JWT fallback,
// since this namespace exists specifically for a tenant's own external systems/scripts, not
// the CRM's own frontend), permission-scoped per key, rate-limited, IP-allowlisted, and
// last-used-tracked all through the single authenticateApiKeyRequest entry point. Reuses
// listLeadsForTenant/createLeadForTenant unchanged -- passing a pseudo-user with no `role`
// gives the key ALL-tenant record-scope by default (matching how a server-to-server credential
// should behave), with the actual permission gate enforced separately below via the key's own
// scoped `permissions`, not by inheriting anything from a real Role.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { apiKey, tenantId } = await authenticateApiKeyRequest(request, { method: "GET", path: url.pathname, rawBody: "" });
    if (!hasApiKeyPermission(apiKey.permissions, "leads", "read")) {
      return forbidden("This API key does not have permission to read leads");
    }
    const page = Number(url.searchParams.get("page") ?? "1");
    const limit = Number(url.searchParams.get("limit") ?? "25");
    const result = await listLeadsForTenant({ id: apiKey.id, tenantId }, page, limit);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiKeyAuthenticationError) return apiKeyAuthErrorResponse(error.reason);
    return serverError("Failed to list leads", error);
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const rawBody = await request.text();
    const { apiKey, tenantId } = await authenticateApiKeyRequest(request, { method: "POST", path: url.pathname, rawBody });
    if (!hasApiKeyPermission(apiKey.permissions, "leads", "create")) {
      return forbidden("This API key does not have permission to create leads");
    }
    const body = rawBody ? JSON.parse(rawBody) : {};
    if (!body?.name || typeof body.name !== "string" || !body.name.trim()) return badRequest("name is required");
    const lead = await createLeadForTenant({ id: apiKey.id, tenantId }, body);
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    if (error instanceof ApiKeyAuthenticationError) return apiKeyAuthErrorResponse(error.reason);
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    return serverError("Failed to create lead", error);
  }
}
