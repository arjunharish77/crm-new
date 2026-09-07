import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listDistributionSimulationsForTenant } from "@/lib/server/distribution-engine";

// Persisted DistributionSimulation history -- both the standalone simulate dialog and the rule
// builder's in-builder draft simulation write here (see simulateDistribution).
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType") ?? undefined;
    const limit = Number(url.searchParams.get("limit") ?? 20) || 20;
    const simulations = await listDistributionSimulationsForTenant(user, entityType, limit);
    return NextResponse.json(simulations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch distribution simulations", error);
  }
}
