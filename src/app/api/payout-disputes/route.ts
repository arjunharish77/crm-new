import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPayoutDisputesForTenant } from "@/lib/server/payout-disputes";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const disputes = await listPayoutDisputesForTenant(user, status);
    return NextResponse.json(disputes);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch payout disputes", error);
  }
}
