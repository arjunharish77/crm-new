import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { computePayoutsForCycle } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const payouts = await computePayoutsForCycle(user, id);

    if (payouts === null) {
      return NextResponse.json({ message: "Payout cycle not found" }, { status: 404 });
    }

    return NextResponse.json(payouts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to compute payouts for cycle", error);
  }
}
