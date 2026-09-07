import { NextResponse } from "next/server";
import { getLeadForTenant, getRecordShareForTenant, upsertRecordShareForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

// Managing sharing is gated the same way owner-scoping is enforced everywhere else in this
// app: the record's own owner, or anyone whose role isn't OWN-scoped (TEAM/ALL) -- not every
// user who merely has read access via an existing share, which would let a shared user
// re-share further.
function canManageSharing(user: any, lead: any) {
  if (lead.ownerId === user.id) return true;
  const permissions = user.role && typeof user.role === "object" ? user.role.permissions : null;
  return permissions?.recordAccess === "TEAM" || permissions?.recordAccess === "ALL";
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const lead = await getLeadForTenant(user, id);
    if (!lead) return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    const share = await getRecordShareForTenant(user, "LEAD", id);
    return NextResponse.json({ sharedUserIds: share?.sharedUserIds ?? [], sharedTeamIds: share?.sharedTeamIds ?? [] });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch lead sharing", error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const lead = await getLeadForTenant(user, id);
    if (!lead) return NextResponse.json({ message: "Lead not found" }, { status: 404 });
    if (!canManageSharing(user, lead)) return forbidden("Only this lead's owner or a team/org-scoped user can manage sharing");
    const body = await request.json().catch(() => ({}));
    const share = await upsertRecordShareForTenant(user, "LEAD", id, {
      sharedUserIds: Array.isArray(body?.sharedUserIds) ? body.sharedUserIds : [],
      sharedTeamIds: Array.isArray(body?.sharedTeamIds) ? body.sharedTeamIds : [],
    });
    return NextResponse.json({ sharedUserIds: share.sharedUserIds, sharedTeamIds: share.sharedTeamIds });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update lead sharing", error);
  }
}
