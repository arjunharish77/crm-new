import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { reorderDashboardTabsForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body?.orderedIds) || !body.orderedIds.every((id: unknown) => typeof id === "string")) {
      return badRequest("orderedIds must be an array of tab ids");
    }
    const tabs = await reorderDashboardTabsForTenant(user, body.orderedIds);
    return NextResponse.json(tabs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to reorder dashboard tabs", error);
  }
}
