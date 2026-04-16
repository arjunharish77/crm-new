import { NextResponse } from "next/server";
import { getOpportunityHistoryForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const history = await getOpportunityHistoryForTenant(user, id);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunity history");
  }
}
