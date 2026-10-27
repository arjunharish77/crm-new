import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { getFunnelExplorerForTenant } from "@/lib/server/inbuilt-reports";
import { parseReportFilters } from "@/lib/server/report-scope";

const SEGMENT_DIMENSIONS = ["SOURCE", "OWNER", "OPPORTUNITY_TYPE", "PARTNER"];

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const segmentDimension = (searchParams.get("segment") ?? "SOURCE").toUpperCase();
    if (!SEGMENT_DIMENSIONS.includes(segmentDimension)) return badRequest(`segment must be one of ${SEGMENT_DIMENSIONS.join(", ")}`);
    const report = await getFunnelExplorerForTenant(user, segmentDimension as any, parseReportFilters(new URL(request.url).searchParams, user.id));
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch funnel explorer report", error);
  }
}
