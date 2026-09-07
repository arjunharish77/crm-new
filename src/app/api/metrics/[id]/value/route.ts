import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getMetricValueForTenant } from "@/lib/server/metrics";
import { badRequest, forbidden, requestTimeout, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await getMetricValueForTenant(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "METRIC_NOT_FOUND") return NextResponse.json({ message: "Metric not found" }, { status: 404 });
    if (error instanceof Error && error.message === "REPORT_QUERY_TIMEOUT") return requestTimeout();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to compute metric value", error);
  }
}
