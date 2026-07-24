import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createPayoutAdjustment } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await createPayoutAdjustment(user, id, body);

    if (!result) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (
      error.message === "INVALID_ADJUSTMENT_AMOUNT" ||
      error.message === "ADJUSTMENT_REASON_REQUIRED" ||
      error.message === "PAYOUT_LOCKED_FOR_ADJUSTMENT" ||
      error.message === "PAYOUT_HELD" ||
      error.message === "PAYOUT_CYCLE_NOT_FOUND"
    )) {
      return badRequest(error.message);
    }
    return serverError("Failed to create payout adjustment", error);
  }
}
