import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listAgentAvailabilityForTenant } from "@/lib/server/agent-availability";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const availability = await listAgentAvailabilityForTenant(user);
    return NextResponse.json(availability);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to view team availability");
    return serverError("Failed to fetch agent availability", error);
  }
}
