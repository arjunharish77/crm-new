import { NextResponse } from "next/server";
import { listAutomationEnrollmentJobsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const jobs = await listAutomationEnrollmentJobsForTenant(user, id);
    return NextResponse.json(jobs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch enrollment jobs");
  }
}
