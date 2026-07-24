import { NextResponse } from "next/server";
import { processPendingReportRefreshJobs } from "@/lib/server/report-rollups";
import { forbidden, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.REPORTING_CRON_SECRET;
    const suppliedSecret = request.headers.get("x-reporting-cron-secret") ?? url.searchParams.get("secret");
    if (!cronSecret) return forbidden("Reporting cron secret is not configured");
    if (suppliedSecret !== cronSecret) return forbidden("Invalid reporting cron secret");

    const limit = Number(url.searchParams.get("limit") ?? 25);
    const result = await processPendingReportRefreshJobs(Number.isFinite(limit) ? limit : 25);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process report refresh jobs", error);
  }
}
