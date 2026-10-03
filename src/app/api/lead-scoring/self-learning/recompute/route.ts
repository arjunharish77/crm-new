import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { enqueueSelfLearningScoringRecompute } from "@/lib/server/job-queue";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    // The actual recompute runs later on the worker (this route only enqueues a job), so
    // the guard inside recomputeSelfLearningScoresForTenant itself wouldn't surface until
    // the job fails asynchronously -- check here too so a disabled tenant gets an immediate
    // 403 instead of a 202 that silently fails later.
    await assertModuleEnabled(user.tenantId, "PREDICTIVE_SCORING", { isPlatformAdmin: user.isPlatformAdmin });
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
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Predictive Scoring module is disabled for this tenant");
    return serverError("Failed to queue predictive score recompute", error);
  }
}
