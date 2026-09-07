import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { exportAppDeliveryLogsCsv } from "@/lib/server/marketplace-diagnostics";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const csv = await exportAppDeliveryLogsCsv(user, id);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="app-${id}-deliveries.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to export delivery logs", error);
  }
}
