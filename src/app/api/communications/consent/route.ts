import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listCurrentConsentForTenant, upsertCommunicationConsentForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Current consent per channel for a record (the consent card on lead and opportunity pages).
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!entityType || !entityId) return badRequest("entityType and entityId are required");
    return NextResponse.json(await listCurrentConsentForTenant(user, entityType, entityId));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch consent", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.entityId || !body?.channel || !body?.status) {
      return badRequest("entityType, entityId, channel, and status are required");
    }
    return NextResponse.json(await upsertCommunicationConsentForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save communication consent", error);
  }
}
