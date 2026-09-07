import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { listDataQualityScorecardHistoryForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 90);
    const scorecards = await listDataQualityScorecardHistoryForTenant(user, limit);
    return NextResponse.json({ reportKey: "data_quality_history", generatedAt: new Date().toISOString(), rows: scorecards });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch data quality scorecard history", error);
  }
}
