import { NextResponse } from "next/server";
import { impersonateTenantUser } from "@/lib/server/admin";
import { forbidden, serverError, unauthorized, badRequest } from "@/lib/server/http";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { isPrivilegedActionApprovalRequired, createPrivilegedActionRequest } from "@/lib/server/privileged-actions";

export async function POST(request: Request) {
  try {
    const adminUser = await requirePlatformAdmin(request);
    // "Blocked sensitive actions" (gap checklist item's own named sub-item) -- an already-
    // impersonated session starting a SECOND impersonation would chain admin identity through
    // an impersonated one, making the audit trail's "who actually did this" ambiguous. Blocked
    // outright rather than allowed-but-logged.
    if (adminUser.isImpersonating) return forbidden("Cannot start a new impersonation session while already impersonating");
    const body = await request.json().catch(() => null);
    if (!body?.userId || !body?.tenantId) {
      return badRequest("userId and tenantId are required");
    }
    if (!body?.reason || !String(body.reason).trim()) {
      return badRequest("A reason is required to start impersonation");
    }

    // Gap checklist: "privileged action controls" -- opt-in (off by default). When on, a
    // different platform admin has to approve before this admin can actually start
    // impersonating; the requester then claims the approved request themselves (see
    // privileged-actions.ts -- the session/token has to be issued to the requester's own
    // browser, not the approver's).
    if (await isPrivilegedActionApprovalRequired("IMPERSONATION_START", null)) {
      const { id: requestId } = await createPrivilegedActionRequest(adminUser, {
        tenantId: null,
        actionType: "IMPERSONATION_START",
        targetType: "USER",
        targetId: body.userId,
        payload: { tenantId: body.tenantId, userId: body.userId, reason: String(body.reason) },
        reason: String(body.reason),
      });
      return NextResponse.json({ pendingApproval: true, requestId });
    }

    const result = await impersonateTenantUser(adminUser.id, body.tenantId, body.userId, String(body.reason));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "IMPERSONATION_REASON_REQUIRED") return badRequest("A reason is required to start impersonation");
    return serverError("Failed to impersonate user");
  }
}
