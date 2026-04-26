import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { removeTeamMemberForTenant } from "@/lib/server/admin-modules";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id, userId } = await params;
    await removeTeamMemberForTenant(user, id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to remove team member", error);
  }
}
