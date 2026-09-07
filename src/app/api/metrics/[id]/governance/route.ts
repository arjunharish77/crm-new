import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { setMetricGovernanceForTenant } from "@/lib/server/metrics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Deliberately a separate route from PATCH /api/metrics/[id]: governance transitions
// (certify/deprecate) are gated by the "manage" module permission regardless of who owns the
// metric, while the base route stays an owner-only definition edit. Keeping them as two routes
// makes that permission split visible at the API surface, not just buried inside one handler.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.certificationStatus === undefined && body?.deprecationStatus === undefined) {
      return badRequest("certificationStatus or deprecationStatus is required");
    }
    const metric = await setMetricGovernanceForTenant(user, id, body);
    return NextResponse.json(metric);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "METRIC_NOT_FOUND") return NextResponse.json({ message: "Metric not found" }, { status: 404 });
    if (error instanceof Error && /Invalid|No governance/i.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to update metric governance", error);
  }
}
