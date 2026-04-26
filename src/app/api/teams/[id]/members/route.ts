import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { addTeamMemberForTenant } from "@/lib/server/admin-modules";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.userId) return badRequest("User is required");
    const member = await addTeamMemberForTenant(user, id, body);
    return NextResponse.json(member);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to add team member", error);
  }
}
