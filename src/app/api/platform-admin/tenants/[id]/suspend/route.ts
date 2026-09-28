import { NextResponse } from "next/server";
import { changeTenantStatus } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { isPrivilegedActionApprovalRequired, createPrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requirePlatformAdmin(request);
    const { id } = await params;

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
      });
      return NextResponse.json({ pendingApproval: true, requestId });
    }

    await changeTenantStatus(id, "SUSPENDED");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to suspend tenant", error);
  }
}
