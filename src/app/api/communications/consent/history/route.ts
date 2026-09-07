import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listConsentHistoryForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    const entityId = url.searchParams.get("entityId");
    if (!entityType || !entityId) return badRequest("entityType and entityId are required");
    const history = await listConsentHistoryForTenant(user, entityType, entityId);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch consent history", error);
  }
}
