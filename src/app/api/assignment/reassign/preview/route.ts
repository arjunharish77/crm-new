import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { previewReassignmentImpact } from "@/lib/server/distribution-engine";

// SLA/workload-impact preview, shown before confirming a reassignment -- read-only, same
// permissiveness as /api/assignment/reassign itself (any authenticated internal user).
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.entityId || !body?.newOwnerId) {
      return badRequest("entityType, entityId, and newOwnerId are required");
    }
    const preview = await previewReassignmentImpact(user, body.entityType, body.entityId, String(body.newOwnerId));
    if (!preview) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to preview reassignment impact", error);
  }
}
