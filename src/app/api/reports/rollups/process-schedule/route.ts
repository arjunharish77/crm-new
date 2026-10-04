import { NextResponse } from "next/server";
import { processDueReportRollupRefreshes } from "@/lib/server/report-rollups";
import { forbidden, serverError } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.REPORTING_CRON_SECRET;
    if (!cronSecret) return forbidden("Reporting cron secret is not configured");
    if (!cronSecretMatches(request, "x-reporting-cron-secret", cronSecret)) return forbidden("Invalid reporting cron secret");

    const limit = Number(url.searchParams.get("limit") ?? 50);
    const result = await processDueReportRollupRefreshes(Number.isFinite(limit) ? limit : 50);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process due report rollup refreshes", error);
  }
}
