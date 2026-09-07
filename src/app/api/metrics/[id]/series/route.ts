import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getMetricGrainSeriesForTenant } from "@/lib/server/metrics";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 17 (semantic metric layer's "grain" sub-item). Returns the stored
// period-snapshot history for a grain-enabled metric (empty series for a live-only metric).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 30);
    const result = await getMetricGrainSeriesForTenant(user, id, Number.isFinite(limit) ? limit : 30);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "METRIC_NOT_FOUND") return NextResponse.json({ message: "Metric not found" }, { status: 404 });
    return serverError("Failed to fetch metric grain series", error);
  }
}
