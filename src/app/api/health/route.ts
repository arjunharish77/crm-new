import { NextResponse } from "next/server";
import { healthSummary } from "@/lib/server/system-health";

export const dynamic = "force-dynamic";

// Public summary for Docker's health check and the deploy script (round-2 plan O5): 503 when the
// database is unreachable; Redis and the worker are reported, and "degraded" when either isn't
// well. Details (queues, heartbeats, failed jobs) are platform-admin only: /api/platform-admin/health.
export async function GET() {
  const summary = await healthSummary();
  return NextResponse.json(summary, { status: summary.database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
