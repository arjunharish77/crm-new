import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getMyAvailabilityForTenant, setMyAvailabilityStatus } from "@/lib/server/agent-availability";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const availability = await getMyAvailabilityForTenant(user);
    return NextResponse.json(availability);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch availability", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.status) return badRequest("status is required");
    const updated = await setMyAvailabilityStatus(user, String(body.status), body.reason);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "INVALID_STATUS") return badRequest("status must be ONLINE, OFFLINE, or BREAK");
    return serverError("Failed to update availability", error);
  }
}
