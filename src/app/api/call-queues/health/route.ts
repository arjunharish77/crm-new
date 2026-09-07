import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCallQueueHealthForTenant } from "@/lib/server/call-queues";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const health = await getCallQueueHealthForTenant(user);
    return NextResponse.json(health);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call queue health", error);
  }
}
