import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getCaseCommunicationHistoryForTenant } from "@/lib/repositories/cases-postgres";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const history = await getCaseCommunicationHistoryForTenant(user, id);
    if (!history) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch case communication history", error);
  }
}
