import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listRecentJobDeadLetters } from "@/lib/server/job-dead-letter";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// WP10 follow-up (F18 item 4/6): platform-admin-only visibility into permanently-failed jobs
// (BullMQ jobs that exhausted every retry attempt) -- see migrations/0108_job_dead_letter.sql and
// job-dead-letter.ts for the durable record this reads. Same request/response shape as the other
// platform-admin stats/list endpoints (e.g. marketplace/suspected-outages, automation/stats).
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    const queueName = searchParams.get("queueName") ?? undefined;
    const tenantId = searchParams.get("tenantId") ?? undefined;
    const rows = await listRecentJobDeadLetters({
      limit: limit && Number.isFinite(limit) ? limit : undefined,
      queueName,
      tenantId,
    });
    return NextResponse.json({ rows, total: rows.length });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch job dead-letter rows", error);
  }
}
