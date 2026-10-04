import { NextResponse } from "next/server";
import { processDueReportSchedules } from "@/lib/server/report-schedules";
import { forbidden, serverError } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.REPORTING_CRON_SECRET;
    if (!cronSecret) return forbidden("Reporting cron secret is not configured");
    if (!cronSecretMatches(request, "x-reporting-cron-secret", cronSecret)) return forbidden("Invalid reporting cron secret");

    const result = await processDueReportSchedules();
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process due report schedules", error);
  }
}
