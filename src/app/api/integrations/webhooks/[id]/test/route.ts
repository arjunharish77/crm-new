import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { sendTestWebhookDelivery } from "@/lib/server/webhook-outbox";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const { id } = await params;
    const result = await sendTestWebhookDelivery(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "WEBHOOK_SUBSCRIPTION_NOT_FOUND") return badRequest("Webhook not found");
    return serverError("Failed to send test delivery", error);
  }
}
