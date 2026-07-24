import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listPartnerInvoicesForPartner } from "@/lib/server/partner-invoices";
import { canCurrentUserAccessPayoutModule } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPartner || !(await canCurrentUserAccessPayoutModule(user))) return forbidden("Payouts are not visible for this account");
    const invoices = await listPartnerInvoicesForPartner(user, user.id);
    return NextResponse.json(invoices);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch invoices", error);
  }
}
