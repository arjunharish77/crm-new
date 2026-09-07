import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { updateDataRetentionPolicyForTenantId } from "@/lib/server/retention";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { tenantId } = await params;
    const body = await request.json().catch(() => ({}));
    const policy = await updateDataRetentionPolicyForTenantId(tenantId, body);
    return NextResponse.json(policy);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("INVALID_")) return badRequest(error.message);
    if (error instanceof Error && error.message === "RETENTION_POLICY_NOT_FOUND") return badRequest("Retention policy not found");
    return serverError("Failed to update retention policy", error);
  }
}
