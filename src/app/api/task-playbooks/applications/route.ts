import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { listTaskPlaybookApplicationsForRecord } from "@/lib/repositories/task-playbooks-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const leadId = url.searchParams.get("leadId");
    const opportunityId = url.searchParams.get("opportunityId");
    const applications = await listTaskPlaybookApplicationsForRecord(user, { leadId, opportunityId });
    return NextResponse.json(applications);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch playbook application history", error);
  }
}
