import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { markPayoutPaid } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { id } = await params;

    if (!body?.paymentReference) {
      return badRequest("paymentReference is required");
    }

    const payout = await markPayoutPaid(user, id, body.paymentReference);

    if (!payout) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }

    return NextResponse.json(payout);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (
      error.message.startsWith("INVALID_PAYOUT_TRANSITION") ||
      error.message === "PAYMENT_REFERENCE_REQUIRED" ||
      error.message === "PAYOUT_HELD" ||
      error.message === "INVOICE_REQUIRED_BEFORE_PAYMENT"
    )) {
      return badRequest(error.message);
    }
    return serverError("Failed to mark payout paid", error);
  }
}
