import { NextResponse } from "next/server";
import { authenticateApiKeyRequest, hasApiKeyPermission, ApiKeyAuthenticationError } from "@/lib/server/api-keys";
import { apiKeyAuthErrorResponse } from "@/lib/server/http";
import { ScimError } from "@/lib/server/scim";

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export function scimJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "content-type": "application/scim+json" } });
}

function scimErrorBody(status: number, detail: string, scimType?: string) {
  return { schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) };
}

// Every SCIM route funnels its try/catch through this so a ScimError, an
// ApiKeyAuthenticationError, and an unexpected exception all produce a spec-shaped SCIM error
// body (RFC 7644 §3.12) rather than this app's normal `{message}` JSON shape -- a real IdP's
// SCIM connector parses this specific schema for its own retry/alerting logic.
export function scimErrorResponse(error: unknown) {
  if (error instanceof ScimError) return scimJson(scimErrorBody(error.status, error.message, error.scimType), error.status);
  if (error instanceof ApiKeyAuthenticationError) {
    const mapped = apiKeyAuthErrorResponse(error.reason);
    return scimJson(scimErrorBody(mapped.status, "Authentication failed"), mapped.status);
  }
  console.error("SCIM_UNHANDLED_ERROR", error);
  return scimJson(scimErrorBody(500, "Internal error"), 500);
}

// Bearer-token auth via the same ApiKey system /api/v1/* already uses, gated by a "users"
// module permission scope (read for GET, write for everything else) -- one fewer credential
// type for a tenant admin to hand an IdP, and the exact same rate-limit/IP-allowlist/
// expiry/revocation machinery every other API-key-authenticated route in this app already gets
// for free via authenticateApiKeyRequest.
export async function authenticateScim(request: Request, requiredAction: "read" | "write") {
  const url = new URL(request.url);
  const rawBody = requiredAction === "write" ? await request.clone().text() : "";
  const { apiKey, tenantId } = await authenticateApiKeyRequest(request, { method: request.method, path: url.pathname, rawBody });
  if (!hasApiKeyPermission(apiKey.permissions, "users", requiredAction)) {
    throw new ScimError(403, `This API key does not have ${requiredAction} permission on the users module`);
  }
  if (!tenantId) throw new ScimError(400, "This credential has no tenant context");
  return { tenantId, actorId: apiKey.id };
}

export function parseListParams(url: URL) {
  return {
    filter: url.searchParams.get("filter"),
    startIndex: url.searchParams.get("startIndex") ? Number(url.searchParams.get("startIndex")) : undefined,
    count: url.searchParams.get("count") ? Number(url.searchParams.get("count")) : undefined,
  };
}
