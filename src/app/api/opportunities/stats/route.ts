import { NextResponse } from "next/server";
import { getOpportunityStatsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const stats = await getOpportunityStatsForTenant(user);
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunity stats");
  }
}
