import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getActivityCallVolumeTrendReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const grainParam = url.searchParams.get("grain");
    const grain = grainParam === "week" || grainParam === "month" ? grainParam : "day";
    const report = await getActivityCallVolumeTrendReportForTenant(
      user,
      grain,
      url.searchParams.get("startDate"),
      url.searchParams.get("endDate")
    );
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch activity/call volume trend report", error);
  }
}
