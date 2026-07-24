import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listScoresForTenant } from "@/lib/server/self-learning-scoring";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { searchParams } = new URL(request.url);
    const recordTypeParam = searchParams.get("recordType");
    const recordType = recordTypeParam === "LEAD" || recordTypeParam === "OPPORTUNITY" ? recordTypeParam : null;
    const scores = await listScoresForTenant(user, {
      recordType,
      recordId: searchParams.get("recordId"),
    });
    return NextResponse.json(scores);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch predictive scores", error);
  }
}
