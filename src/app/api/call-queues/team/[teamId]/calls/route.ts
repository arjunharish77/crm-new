import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listQueuedCallsForTeam } from "@/lib/server/call-queues";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { teamId } = await params;
    const calls = await listQueuedCallsForTeam(user, teamId);
    return NextResponse.json(calls);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TEAM_NOT_FOUND") return notFound("Team not found");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You can only see the queues of teams you're on");
    return serverError("Failed to fetch queued calls", error);
  }
}
