import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { generatePayoutStatementCsv, getPayoutBreakdownForPartner } from "@/lib/server/payouts";
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
    const csv = await generatePayoutStatementCsv(user, id);
    const friendlyName = (breakdown.cycle.cycleLabel || id).replace(/[^a-zA-Z0-9._-]/g, "-");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="Payout-Statement-${friendlyName}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PAYOUT_NOT_VISIBLE_FOR_USER") {
      return forbidden("You can only download the statement for your own payout");
    }
    return serverError("Failed to generate payout statement", error);
  }
}
