import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listScoringModelVersionsForTenant } from "@/lib/server/self-learning-scoring";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const targetModule = new URL(request.url).searchParams.get("targetModule");
    const models = await listScoringModelVersionsForTenant(
      user,
      targetModule === "LEAD" || targetModule === "OPPORTUNITY" ? targetModule : undefined,
    );
    return NextResponse.json(models);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to list scoring model versions", error);
  }
}
