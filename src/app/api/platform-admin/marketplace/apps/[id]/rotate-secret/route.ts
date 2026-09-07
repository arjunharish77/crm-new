import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { rotateAppSecretAsPlatformAdmin } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    // A published app can have one credential per installing tenant (migration 0066) -- the
    // caller must say which tenant's secret to rotate, same as suspend already scopes to a
    // specific tenant's install where it needs to.
    if (!body?.tenantId || typeof body.tenantId !== "string") return badRequest("tenantId is required");
    const result = await rotateAppSecretAsPlatformAdmin(user, id, body.tenantId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_FOUND") return badRequest("App not found");
    if (error instanceof Error && error.message === "APP_SECRET_NOT_FOUND") return badRequest("App credentials not found");
    return serverError("Failed to rotate app secret", error);
  }
}
