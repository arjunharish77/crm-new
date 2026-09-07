import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getExecutiveScorecardReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const report = await getExecutiveScorecardReportForTenant(user);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SENSITIVE_REPORT_ACCESS_DENIED") return forbidden();
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return badRequest(error.message);
    return serverError("Failed to fetch executive scorecard", error);
  }
}
