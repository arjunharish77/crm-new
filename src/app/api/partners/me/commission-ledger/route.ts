import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCommissionLedgerForPartner } from "@/lib/server/commission";
import { requirePartnerPayoutAccess } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await requirePartnerPayoutAccess(user);

    const entries = await listCommissionLedgerForPartner(user, user.id);
    return NextResponse.json(entries);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PAYOUTS_NOT_VISIBLE_FOR_USER") return forbidden("Payouts are not visible for this account");
    return serverError("Failed to fetch commission ledger", error);
  }
}
