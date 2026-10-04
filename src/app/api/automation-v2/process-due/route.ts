import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { processDueAutomationJobs, processDueAutomationJobsForTenant } from "@/lib/server/crm";
import { serverError, unauthorized, forbidden } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "25");
    const cronSecret = process.env.AUTOMATION_CRON_SECRET;

    if (cronSecretMatches(request, "x-automation-cron-secret", cronSecret)) {
      const result = await processDueAutomationJobs(limit);
      return NextResponse.json(result);
    }

    const user = await requireTenantAdmin(request);
    const result = await processDueAutomationJobsForTenant(user, limit);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    return serverError("Failed to process due automation jobs", error);
  }
}
