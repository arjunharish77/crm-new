import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { updateSecurityPolicy } from "@/lib/server/security-policy";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    await requirePlatformAdmin(request);
    const { tenantId } = await params;
    const body = await request.json().catch(() => ({}));
    const updated = await updateSecurityPolicy(tenantId, body);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "SECURITY_POLICY_UPDATE_FAILED") return badRequest("Failed to update security policy");
    return serverError("Failed to update security policy", error);
  }
}
