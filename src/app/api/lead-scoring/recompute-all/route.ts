import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { enqueueRuleScoringRecompute } from "@/lib/server/job-queue";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { alreadyQueued } = await enqueueRuleScoringRecompute({ tenantId: user.tenantId, userId: user.id });
    return NextResponse.json({ queued: true, alreadyRunning: alreadyQueued }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to queue lead score recompute", error);
  }
}
