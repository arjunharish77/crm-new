import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { retryInboundWebhookEvent } from "@/lib/server/inbound-webhooks";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await retryInboundWebhookEvent(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "INBOUND_WEBHOOK_EVENT_NOT_FOUND") return badRequest("Event not found");
    if (error instanceof Error && error.message === "INBOUND_WEBHOOK_EVENT_NOT_RETRYABLE") return badRequest("Only failed events can be retried");
    return serverError("Failed to retry inbound webhook event", error);
  }
}
