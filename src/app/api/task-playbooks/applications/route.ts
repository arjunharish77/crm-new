import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { notFound, serverError, unauthorized } from "@/lib/server/http";
import { assertRecordVisibleForUser } from "@/lib/server/crm";
import { listTaskPlaybookApplicationsForRecord } from "@/lib/repositories/task-playbooks-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const opportunityId = url.searchParams.get("opportunityId");
    // A record's playbook history is only for people who can open the record (any id worked before).
    if (leadId) await assertRecordVisibleForUser(user, "LEAD", leadId);
    if (opportunityId) await assertRecordVisibleForUser(user, "OPPORTUNITY", opportunityId);
    const applications = await listTaskPlaybookApplicationsForRecord(user, { leadId, opportunityId });
    return NextResponse.json(applications);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "RECORD_NOT_FOUND") return notFound("Record not found");
    return serverError("Failed to fetch playbook application history", error);
  }
}
