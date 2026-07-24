import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { recomputeSelfLearningScoresForTenant } from "@/lib/server/self-learning-scoring";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => ({}));
    const targetModules = Array.isArray(body?.targetModules)
      ? body.targetModules.filter((module: unknown) => module === "LEAD" || module === "OPPORTUNITY")
      : undefined;
    const result = await recomputeSelfLearningScoresForTenant(user, {
      targetModules,
      force: body?.force === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to recompute predictive scores", error);
  }
}
