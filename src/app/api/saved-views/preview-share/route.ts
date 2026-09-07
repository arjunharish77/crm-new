import { NextResponse } from "next/server";
import { previewSavedViewShareTargets } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

// Resolves not-yet-saved share targets (from the builder, before the user hits Save) into
// the concrete list of people who would gain access -- team/sales-group/role membership
// expanded, not just the raw id arrays being edited.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const targets = await previewSavedViewShareTargets(user, {
      sharedUserIds: Array.isArray(body?.sharedUserIds) ? body.sharedUserIds : [],
      sharedTeamIds: Array.isArray(body?.sharedTeamIds) ? body.sharedTeamIds : [],
      sharedSalesGroupIds: Array.isArray(body?.sharedSalesGroupIds) ? body.sharedSalesGroupIds : [],
      sharedRoleIds: Array.isArray(body?.sharedRoleIds) ? body.sharedRoleIds : [],
    });
    return NextResponse.json(targets);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to preview share targets", error);
  }
}
