import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { simulateDistribution } from "@/lib/server/distribution-engine";

// Read-only: runs the real matching/candidate-selection/quota/skill logic against a supplied
// record without ever writing ownerId, an AuditLog row, or advancing a round-robin cursor.
// Deliberately not gated by the DISTRIBUTION module -- an admin should still be able to
// preview what re-enabling it would do while it's off.
export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.record || typeof body.record !== "object") {
      return badRequest("entityType and record are required");
    }
    const outcome = await simulateDistribution(user, body.entityType, body.record, body.draftRule ?? undefined);
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to simulate distribution", error);
  }
}
