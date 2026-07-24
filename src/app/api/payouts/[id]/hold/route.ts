import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { holdPayout } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const payout = await holdPayout(user, id, body.holdReason);
    if (!payout) return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    return NextResponse.json(payout);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "HOLD_REASON_REQUIRED") return badRequest(error.message);
    return serverError("Failed to hold payout", error);
  }
}
