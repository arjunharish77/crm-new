import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { releasePayoutHold } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const payout = await releasePayoutHold(user, id);
    if (!payout) return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    return NextResponse.json(payout);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to release payout hold", error);
  }
}
