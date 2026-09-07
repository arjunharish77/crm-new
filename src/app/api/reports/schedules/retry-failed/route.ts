import { NextResponse } from "next/server";
import { retryFailedReportSchedules } from "@/lib/server/report-schedules";
import { forbidden, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.REPORTING_CRON_SECRET;
    const suppliedSecret = request.headers.get("x-reporting-cron-secret") ?? url.searchParams.get("secret");
    if (!cronSecret) return forbidden("Reporting cron secret is not configured");
    if (suppliedSecret !== cronSecret) return forbidden("Invalid reporting cron secret");

    const result = await retryFailedReportSchedules();
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to retry failed report schedules", error);
  }
}
