import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { generateCycleFinanceCsv } from "@/lib/server/partner-invoices";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const csv = await generateCycleFinanceCsv(user, id);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="payout-cycle-${id}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to export cycle CSV", error);
  }
}
