import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { releaseQueuedCall } from "@/lib/server/call-queues";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ callLogId: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { callLogId } = await params;
    const released = await releaseQueuedCall(user, callLogId);
    return NextResponse.json(released);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CALL_NOT_QUEUED") return badRequest("This call isn't in a queue");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to release this call");
    return serverError("Failed to release call", error);
  }
}
