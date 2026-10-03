import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertRecordVisibleForUser } from "@/lib/server/crm";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listScoresForTenant } from "@/lib/server/self-learning-scoring";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { searchParams } = new URL(request.url);
    const recordTypeParam = searchParams.get("recordType");
    const recordType = recordTypeParam === "LEAD" || recordTypeParam === "OPPORTUNITY" ? recordTypeParam : null;
    const recordId = searchParams.get("recordId");
    // One record's scores need access to that record; the whole workspace's list is for admins
    // (it returned every score to anyone signed in).
    if (recordId) {
      if (!recordType) return badRequest("recordType is required with recordId");
      await assertRecordVisibleForUser(user, recordType, recordId);
    } else if (!user.isTenantAdmin && !user.isPlatformAdmin) {
      return forbidden("Only admins can list scores for the whole workspace");
    }
    const scores = await listScoresForTenant(user, { recordType, recordId });
    return NextResponse.json(scores);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "RECORD_NOT_FOUND") return NextResponse.json({ message: "Record not found" }, { status: 404 });
    return serverError("Failed to fetch predictive scores", error);
  }
}
