import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getSplitTestPerformanceReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const report = await getSplitTestPerformanceReportForTenant(user);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch split test performance report", error);
  }
}
