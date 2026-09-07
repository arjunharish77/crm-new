import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { getCohortReportForTenant } from "@/lib/server/inbuilt-reports";

const DIMENSIONS = ["CREATED_DATE", "SOURCE", "CAMPAIGN", "SCORE_BAND", "OWNER", "SALES_GROUP", "TEAM"];

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const grainParam = url.searchParams.get("grain");
    const grain = grainParam === "week" ? "week" : "month";
    const dimension = (url.searchParams.get("dimension") ?? "CREATED_DATE").toUpperCase();
    if (!DIMENSIONS.includes(dimension)) return badRequest(`dimension must be one of ${DIMENSIONS.join(", ")}`);
    const report = await getCohortReportForTenant(user, grain, dimension as any);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch cohort funnel progression report", error);
  }
}
