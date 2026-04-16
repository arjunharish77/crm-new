import { NextResponse } from "next/server";
import { getGovernanceHistoryForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { entityType, entityId } = await params;
    const history = await getGovernanceHistoryForTenant(user, entityType, entityId);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch governance history");
  }
}
