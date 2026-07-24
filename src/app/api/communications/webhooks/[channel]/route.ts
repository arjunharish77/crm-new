import { NextResponse } from "next/server";
import { recordProviderWebhookEvent } from "@/lib/server/communications";
import { badRequest, forbidden, serverError } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  try {
    const { channel } = await params;
    const url = new URL(request.url);
    const tenantId = url.searchParams.get("tenantId");
    const webhookSecret = process.env.COMMUNICATIONS_WEBHOOK_SECRET;
    const suppliedSecret = request.headers.get("x-communications-webhook-secret") ?? url.searchParams.get("secret");
    if (!webhookSecret) return forbidden("Communications webhook secret is not configured");
    if (suppliedSecret !== webhookSecret) return forbidden("Invalid communications webhook secret");
    if (!tenantId) return badRequest("tenantId is required");
    const body = await request.json().catch(() => ({}));
    const event = await recordProviderWebhookEvent({
      tenantId,
      channel: channel.toUpperCase() as any,
      eventType: String(body.eventType ?? body.status ?? "PROVIDER_EVENT").toUpperCase(),
      providerMessageId: body.providerMessageId ?? body.messageId ?? null,
      payload: body,
      entityType: body.entityType ?? null,
      entityId: body.entityId ?? null,
    });
    return NextResponse.json(event);
  } catch (error) {
    return serverError("Failed to record communication webhook", error);
  }
}
