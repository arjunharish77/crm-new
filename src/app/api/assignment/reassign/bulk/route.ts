import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { bulkReassignRecordOwners } from "@/lib/server/distribution-engine";

// Bulk version of /api/assignment/reassign -- same governance (reason required, per-record
// AssignmentLog/AuditLog row, previous-owner notification), applied sequentially so one bad
// id in a large selection can't take out the rest of the batch.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !Array.isArray(body?.entityIds) || body.entityIds.length === 0 || !body?.newOwnerId || !body?.reason) {
      return badRequest("entityType, entityIds, newOwnerId, and reason are required");
    }
    if (body.entityIds.length > 500) return badRequest("At most 500 records can be reassigned at once");
    const outcome = await bulkReassignRecordOwners(user, body.entityType, body.entityIds.map(String), {
      newOwnerId: String(body.newOwnerId),
      reason: String(body.reason),
    });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to bulk reassign records", error);
  }
}
