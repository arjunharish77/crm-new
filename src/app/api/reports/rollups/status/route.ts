import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listReportRefreshStatesForTenant } from "@/lib/server/report-rollups";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const states = await listReportRefreshStatesForTenant(user);
    return NextResponse.json({ states });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load report rollup status", error);
  }
}
