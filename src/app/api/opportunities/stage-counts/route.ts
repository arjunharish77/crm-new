import { NextResponse } from "next/server";
import { getOpportunityStageCountsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const counts = await getOpportunityStageCountsForTenant(user);
    return NextResponse.json(counts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch opportunity stage counts", error);
  }
}
