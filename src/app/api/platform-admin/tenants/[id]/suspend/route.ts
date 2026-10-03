import { NextResponse } from "next/server";
import { setTenantStatusForPlatformAdmin } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { isPrivilegedActionApprovalRequired, createPrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
    if (!reason) return badRequest("Give a reason for suspending this workspace");

    // Gap checklist: "privileged action controls" -- opt-in via PlatformSecuritySettings (off
    // by default, so no platform admin's existing workflow changes unless someone deliberately
    // turns this on). When on, a DIFFERENT platform admin has to approve before the tenant is
    // actually suspended.
    if (await isPrivilegedActionApprovalRequired("TENANT_SUSPEND", null)) {
      const { id: requestId } = await createPrivilegedActionRequest(admin, {
        tenantId: null,
        actionType: "TENANT_SUSPEND",
        targetType: "TENANT",
        targetId: id,
        payload: {},
        reason: reason || null,
      });
      return NextResponse.json({ pendingApproval: true, requestId });
    }

    await setTenantStatusForPlatformAdmin(admin, id, "SUSPENDED", { reason });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TENANT_NOT_FOUND") return notFound("Workspace not found");
    return serverError("Failed to suspend tenant", error);
  }
}
