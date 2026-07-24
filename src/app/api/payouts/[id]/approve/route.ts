import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { approvePayout } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const payout = await approvePayout(user, id);

    if (!payout) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }

    return NextResponse.json(payout);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (
      error.message.startsWith("INVALID_PAYOUT_TRANSITION") ||
      error.message === "PAYOUT_HELD" ||
      error.message === "PAYOUT_BELOW_MINIMUM"
    )) {
      return badRequest(error.message);
    }
    return serverError("Failed to approve payout", error);
  }
}
