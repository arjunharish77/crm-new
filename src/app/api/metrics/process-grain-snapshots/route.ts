import { NextResponse } from "next/server";
import { computeDueMetricGrainSnapshots } from "@/lib/server/metrics";
import { forbidden, serverError } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

// Mirrors /api/reports/rollups/process-schedule's own dual (persistent-worker + serverless-cron)
// invocation pattern.
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.REPORTING_CRON_SECRET;
    if (!cronSecret) return forbidden("Reporting cron secret is not configured");
    if (!cronSecretMatches(request, "x-reporting-cron-secret", cronSecret)) return forbidden("Invalid reporting cron secret");

    const limit = Number(url.searchParams.get("limit") ?? 200);
    const result = await computeDueMetricGrainSnapshots(Number.isFinite(limit) ? limit : 200);
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to process due metric grain snapshots", error);
  }
}
