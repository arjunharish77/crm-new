import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { enqueueSelfLearningScoringRecompute } from "@/lib/server/job-queue";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => ({}));
    const targetModules = Array.isArray(body?.targetModules)
      ? body.targetModules.filter((module: unknown) => module === "LEAD" || module === "OPPORTUNITY")
      : undefined;
    const { alreadyQueued } = await enqueueSelfLearningScoringRecompute({
      tenantId: user.tenantId,
      userId: user.id,
      targetModules,
      force: body?.force === true,
    });
    return NextResponse.json({ queued: true, alreadyRunning: alreadyQueued }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to queue predictive score recompute", error);
  }
}
