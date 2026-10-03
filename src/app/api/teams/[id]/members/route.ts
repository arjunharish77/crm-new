import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { addTeamMemberForTenant } from "@/lib/server/admin-modules";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.userId) return badRequest("User is required");
    const member = await addTeamMemberForTenant(user, id, body);
    return NextResponse.json(member);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "TEAM_NOT_FOUND") return NextResponse.json({ message: "Team not found" }, { status: 404 });
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return badRequest("That user isn't in this workspace");
    if (error instanceof Error && error.message === "ALREADY_TEAM_MEMBER") return NextResponse.json({ message: "They're already on this team" }, { status: 409 });
    return serverError("Failed to add team member", error);
  }
}
