import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getTeamForTenant } from "@/lib/server/admin-modules";
import { getTeamPerformanceForTenant } from "@/lib/server/inbuilt-reports";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards") -- a real per-team performance mini-dashboard, reusing the existing
// rep-performance report filtered down to this team's own members.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const team = await getTeamForTenant(user, id);
    if (!team) return NextResponse.json({ message: "Team not found" }, { status: 404 });
    const memberUserIds = (team.members ?? []).map((member: any) => member.userId);
    const performance = await getTeamPerformanceForTenant(user, memberUserIds);
    return NextResponse.json(performance);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch team performance", error);
  }
}
