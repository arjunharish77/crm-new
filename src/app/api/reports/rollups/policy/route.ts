import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateReportRefreshPolicyForTenant } from "@/lib/server/report-rollups";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body.reportKey) return badRequest("reportKey is required");
    if (body.refreshIntervalMinutes === undefined) return badRequest("refreshIntervalMinutes is required");

    const state = await updateReportRefreshPolicyForTenant(user, body);
    return NextResponse.json({ state });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (error.message === "REPORT_KEY_REQUIRED" || error.message === "INVALID_REFRESH_INTERVAL")) {
      return badRequest(error.message);
    }
    return serverError("Failed to update report refresh policy", error);
  }
}
