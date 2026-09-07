import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { revokeApiKeyForTenant, updateApiKeyForTenant } from "@/lib/server/api-keys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const key = await updateApiKeyForTenant(user, id, body);
    return NextResponse.json(key);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") return badRequest("API key not found");
    if (error instanceof Error && error.message === "API_KEY_NAME_REQUIRED") return badRequest("A name is required");
    if (error instanceof Error && error.message === "DUPLICATE_API_KEY_NAME") return badRequest("An API key with this name already exists");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("API Access is not enabled for this workspace");
    }
    return serverError("Failed to update API key", error);
  }
}

// Revoke, not delete -- the row (and its usage history) survives with isActive=false.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const key = await revokeApiKeyForTenant(user, id);
    return NextResponse.json(key);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") return badRequest("API key not found");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("API Access is not enabled for this workspace");
    }
    return serverError("Failed to revoke API key", error);
  }
}
