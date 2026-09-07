import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createPayoutDispute, listPayoutDisputesForPayout } from "@/lib/server/payout-disputes";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const disputes = await listPayoutDisputesForPayout(user, id);
    return NextResponse.json(disputes);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch payout disputes", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const dispute = await createPayoutDispute(user, id, body?.reason);
    if (!dispute) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }
    return NextResponse.json(dispute);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PAYOUT_NOT_VISIBLE_FOR_USER") {
      return forbidden("You can only raise a dispute for your own payout");
    }
    if (error instanceof Error && error.message === "DISPUTE_REASON_REQUIRED") {
      return badRequest("A reason is required to raise a dispute");
    }
    return serverError("Failed to raise payout dispute", error);
  }
}
