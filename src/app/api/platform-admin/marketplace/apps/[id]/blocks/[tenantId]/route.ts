import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { unblockAppForTenant } from "@/lib/server/marketplace";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; tenantId: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id, tenantId } = await params;
    const result = await unblockAppForTenant(user, tenantId, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "APP_TENANT_BLOCK_NOT_FOUND") return badRequest("This tenant is not blocked from this app");
    return serverError("Failed to unblock app for tenant", error);
  }
}
