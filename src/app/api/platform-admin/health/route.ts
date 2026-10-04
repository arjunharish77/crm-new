import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { failedJobsLastDay, healthSummary, queueCounts, workerHeartbeats } from "@/lib/server/system-health";

export const dynamic = "force-dynamic";

// Round-2 plan O5: the full picture for platform admins (shown on Platform › Failed jobs).
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const [summary, heartbeats, queues, failedLastDay] = await Promise.all([healthSummary(), workerHeartbeats(), queueCounts(), failedJobsLastDay()]);
    return NextResponse.json({ ...summary, heartbeats: heartbeats.classes, queues, failedLastDay });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to read system health", error);
  }
}
