import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { supervisorUpdateAgentAvailability } from "@/lib/server/agent-availability";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { userId } = await params;
    const body = await request.json().catch(() => null);
    const updated = await supervisorUpdateAgentAvailability(user, userId, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "USER_NOT_FOUND") return badRequest("User not found");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to override this agent's availability");
    if (error instanceof Error && error.message === "INVALID_STATUS") return badRequest("status must be ONLINE, OFFLINE, or BREAK");
    return serverError("Failed to update agent availability", error);
  }
}
