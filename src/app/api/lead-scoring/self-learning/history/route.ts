import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listScoreHistoryForTenant } from "@/lib/server/self-learning-scoring";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { searchParams } = new URL(request.url);
    const recordType = searchParams.get("recordType");
    const recordId = searchParams.get("recordId");
    if ((recordType !== "LEAD" && recordType !== "OPPORTUNITY") || !recordId) {
      return badRequest("recordType and recordId are required");
    }
    const history = await listScoreHistoryForTenant(user, { recordType, recordId });
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch predictive score history", error);
  }
}
