import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getAnomalyDetectionReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const report = await getAnomalyDetectionReportForTenant(user);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch anomaly detection report", error);
  }
}
