import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getPayoutBreakdownForPartner } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const breakdown = await getPayoutBreakdownForPartner(user, id);
    if (!breakdown) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }
    return NextResponse.json(breakdown);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PAYOUT_NOT_VISIBLE_FOR_USER") {
      return forbidden("You can only view the breakdown for your own payout");
    }
    return serverError("Failed to fetch payout breakdown", error);
  }
}
