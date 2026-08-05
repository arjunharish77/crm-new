import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { upsertCommunicationConsentForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

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
