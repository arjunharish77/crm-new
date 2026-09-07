import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { getCommissionPayoutSummaryReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "payoutsEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const report = await getCommissionPayoutSummaryReportForTenant(user);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Payouts is not enabled for this workspace");
    }
    return serverError("Failed to fetch commission/payout summary report", error);
  }
}
