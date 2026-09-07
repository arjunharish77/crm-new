import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import {
  LEAD_COMPARISON_DIMENSIONS,
  OPPORTUNITY_COMPARISON_DIMENSIONS,
  getSegmentComparisonReportForTenant,
} from "@/lib/server/inbuilt-reports";

function parseSegment(searchParams: URLSearchParams, suffix: "A" | "B"): { level: "LEAD" | "OPPORTUNITY"; dimension: string; value: string } | null {
  const level = searchParams.get(`level${suffix}`);
  const dimension = searchParams.get(`dimension${suffix}`);
  const value = searchParams.get(`value${suffix}`);
  if (level !== "LEAD" && level !== "OPPORTUNITY") return null;
  if (!dimension || !value) return null;
  const allowed = level === "LEAD" ? LEAD_COMPARISON_DIMENSIONS : OPPORTUNITY_COMPARISON_DIMENSIONS;
  if (!(allowed as readonly string[]).includes(dimension)) return null;
  return { level, dimension, value };
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const segmentA = parseSegment(searchParams, "A");
    const segmentB = parseSegment(searchParams, "B");
    if (!segmentA || !segmentB) {
      return badRequest(
        `Both segments require levelA/dimensionA/valueA and levelB/dimensionB/valueB. ` +
        `LEAD dimensions: ${LEAD_COMPARISON_DIMENSIONS.join(", ")}. OPPORTUNITY dimensions: ${OPPORTUNITY_COMPARISON_DIMENSIONS.join(", ")}.`,
      );
    }
    const report = await getSegmentComparisonReportForTenant(user, segmentA, segmentB);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to compare segments", error);
  }
}
