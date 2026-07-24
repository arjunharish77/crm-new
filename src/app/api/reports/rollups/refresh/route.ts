import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { refreshReportRollupForTenant, requestReportRollupRefresh } from "@/lib/server/report-rollups";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body.reportKey) return badRequest("reportKey is required");

    if (body.runNow === true) {
      const rollup = await refreshReportRollupForTenant(user, body);
      return NextResponse.json({ rollup });
    }

    const job = await requestReportRollupRefresh(user, body);
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (error.message === "REPORT_KEY_REQUIRED" || error.message === "UNKNOWN_REPORT_KEY")) {
      return badRequest(error.message);
    }
    return serverError("Failed to refresh report rollup", error);
  }
}
