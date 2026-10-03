import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { reassignRecordOwner } from "@/lib/server/distribution-engine";

// Governed single-record reassignment -- takes an optional reason, writes a real decision log
// (AssignmentLog + AuditLog), and notifies the previous owner. Any authenticated internal
// user can call this (matches the permissiveness of the quick action it replaces); it is
// intentionally not gated by the DISTRIBUTION module, since manual assignment must keep
// working even when automatic rule-based routing is disabled for the tenant.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.entityId || !body?.newOwnerId) {
      return badRequest("entityType, entityId and newOwnerId are required");
    }
    // UI/UX plan decision 17: the reason is optional when changing one record (it stays
    // required for bulk). The log still always gets one.
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "No reason given";
    const outcome = await reassignRecordOwner(user, body.entityType, body.entityId, {
      newOwnerId: String(body.newOwnerId),
      reason,
    });
    if (!outcome) return NextResponse.json(null, { status: 404 });
    // A tenant with reassignmentApprovalRequired turned on gets a pending request instead of
    // an immediate reassignment -- 202 Accepted, distinct from the normal 200 success shape.
    if ("pendingApproval" in outcome && outcome.pendingApproval) return NextResponse.json(outcome, { status: 202 });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && (error.message === "REASSIGNMENT_REASON_REQUIRED" || error.message === "REASSIGNMENT_TARGET_REQUIRED")) {
      return badRequest("A reassignment reason and target user are required");
    }
    if (error instanceof Error && error.message === "REASSIGNMENT_TARGET_USER_NOT_FOUND") return badRequest("Target user not found");
    if (error instanceof Error && error.message === "REASSIGNMENT_LIMIT_EXCEEDED") return badRequest("This record has reached its reassignment limit for the current window");
    return serverError("Failed to reassign record", error);
  }
}
