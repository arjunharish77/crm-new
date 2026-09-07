import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createApiKeyForTenant, listApiKeysForTenant } from "@/lib/server/api-keys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const keys = await listApiKeysForTenant(user);
    return NextResponse.json(keys);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("API Access is not enabled for this workspace");
    }
    return serverError("Failed to fetch API keys", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const key = await createApiKeyForTenant(user, body);
    return NextResponse.json(key);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "API_KEY_NAME_REQUIRED") return badRequest("A name is required");
    if (error instanceof Error && error.message === "DUPLICATE_API_KEY_NAME") return badRequest("An API key with this name already exists");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("API Access is not enabled for this workspace");
    }
    return serverError("Failed to create API key", error);
  }
}
