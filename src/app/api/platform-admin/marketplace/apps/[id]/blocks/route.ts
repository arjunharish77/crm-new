import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { blockAppForTenant } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.tenantId || typeof body.tenantId !== "string") return badRequest("tenantId is required");
    const result = await blockAppForTenant(user, body.tenantId, id, body?.reason ?? null);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_FOUND") return badRequest("App not found");
    return serverError("Failed to block app for tenant", error);
  }
}
