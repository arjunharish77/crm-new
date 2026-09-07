import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getPartnerDashboardForTenant } from "@/lib/server/partners";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards") -- a real per-partner commission/payout mini-dashboard, reusing the
// existing listCommissionLedgerForPartner/listPayoutsForPartner data-fetching paths.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const dashboard = await getPartnerDashboardForTenant(user, id);
    if (!dashboard) return NextResponse.json({ message: "Partner not found" }, { status: 404 });
    return NextResponse.json(dashboard);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch partner dashboard", error);
  }
}
