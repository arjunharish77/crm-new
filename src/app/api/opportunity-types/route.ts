import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listOpportunityTypesForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const types = await listOpportunityTypesForTenant(user);
    return NextResponse.json(types);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunity types");
  }
}
