import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { generateNextPayoutCycle, listPayoutCyclesForTenant } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const cycles = await listPayoutCyclesForTenant(user);
    return NextResponse.json(cycles);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch payout cycles", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const cycle = await generateNextPayoutCycle(user);
    return NextResponse.json(cycle);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PAYOUT_SETTINGS_NOT_CONFIGURED") {
      return badRequest("Configure payout cycle settings before generating a cycle");
    }
    return serverError("Failed to generate payout cycle", error);
  }
}
