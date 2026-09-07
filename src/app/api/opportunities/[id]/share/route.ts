import { NextResponse } from "next/server";
import { getOpportunityForTenant, getRecordShareForTenant, upsertRecordShareForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

// Same gating as /api/leads/[id]/share -- see that file's comment.
function canManageSharing(user: any, opportunity: any) {
  if (opportunity.ownerId === user.id) return true;
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return permissions?.recordAccess === "TEAM" || permissions?.recordAccess === "ALL";
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const opportunity = await getOpportunityForTenant(user, id);
    if (!opportunity) return NextResponse.json({ message: "Opportunity not found" }, { status: 404 });
    const share = await getRecordShareForTenant(user, "OPPORTUNITY", id);
    return NextResponse.json({ sharedUserIds: share?.sharedUserIds ?? [], sharedTeamIds: share?.sharedTeamIds ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch opportunity sharing", error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const opportunity = await getOpportunityForTenant(user, id);
    if (!opportunity) return NextResponse.json({ message: "Opportunity not found" }, { status: 404 });
    if (!canManageSharing(user, opportunity)) return forbidden("Only this opportunity's owner or a team/org-scoped user can manage sharing");
    const body = await request.json().catch(() => ({}));
    const share = await upsertRecordShareForTenant(user, "OPPORTUNITY", id, {
      sharedUserIds: Array.isArray(body?.sharedUserIds) ? body.sharedUserIds : [],
      sharedTeamIds: Array.isArray(body?.sharedTeamIds) ? body.sharedTeamIds : [],
    });
    return NextResponse.json({ sharedUserIds: share.sharedUserIds, sharedTeamIds: share.sharedTeamIds });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update opportunity sharing", error);
  }
}
