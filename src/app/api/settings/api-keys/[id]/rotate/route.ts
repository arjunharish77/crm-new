import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { rotateApiKeyForTenant } from "@/lib/server/api-keys";
import { isPrivilegedActionApprovalRequired, createPrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;

    // Gap checklist: "privileged action controls" -- connector secret changes, scoped to API
    // key rotation in this pass (see the checklist writeup for what's not covered).
    if (await isPrivilegedActionApprovalRequired("CONNECTOR_SECRET_UPDATE", user.tenantId)) {
      const { id: requestId } = await createPrivilegedActionRequest(user, {
        tenantId: user.tenantId,
        actionType: "CONNECTOR_SECRET_UPDATE",
        targetType: "API_KEY",
        targetId: id,
        payload: {},
      });
      return NextResponse.json({ pendingApproval: true, requestId });
    }

    const key = await rotateApiKeyForTenant(user, id);
    return NextResponse.json(key);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "API_KEY_NOT_FOUND") return badRequest("API key not found");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("API Access is not enabled for this workspace");
    }
    return serverError("Failed to rotate API key", error);
  }
}
