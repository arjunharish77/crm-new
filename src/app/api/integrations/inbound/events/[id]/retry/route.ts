import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { retryInboundWebhookEvent } from "@/lib/server/inbound-webhooks";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
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
