import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { canCurrentUserAccessPayoutModule, listPayoutsForPartner } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);

    if (!user.isPartner || !(await canCurrentUserAccessPayoutModule(user))) {
      return forbidden("Payouts are not visible for this account");
    }

    const payouts = await listPayoutsForPartner(user, user.id);
    return NextResponse.json(payouts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch payouts", error);
  }
}
