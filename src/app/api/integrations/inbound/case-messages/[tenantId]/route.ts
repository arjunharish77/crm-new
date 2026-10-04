import { NextResponse } from "next/server";
import { badRequest, forbidden, serverError } from "@/lib/server/http";
import { verifyInboundWebhookRequest } from "@/lib/server/inbound-webhooks";
import { captureInboundCaseMessage } from "@/lib/repositories/case-inbound-postgres";

type Params = {
  params: Promise<{ tenantId: string }>;
};

// Email-to-case / message-to-case routing entry point (gap checklist Module 11, item 5).
// Reuses the tenant's existing inbound-webhook HMAC secret/verification (the same one
// captureInboundLead already uses) rather than a new per-purpose secret scheme.
export async function POST(request: Request, { params }: Params) {
  try {
    const { tenantId } = await params;
    const rawBody = await request.text();

    const auth = await verifyInboundWebhookRequest(tenantId, rawBody, {
      signature: request.headers.get("x-webhook-signature"),
      timestamp: request.headers.get("x-webhook-timestamp"),
    });
    if (!auth.ok) {
      if (auth.reason === "STALE_TIMESTAMP") return forbidden("Request timestamp is missing or outside the allowed window");
      return forbidden("Invalid or missing webhook signature");
    }

    let body: any = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return badRequest("Request body must be valid JSON");
    }
    if (!body?.channel || !body?.fromAddress || !body?.body) {
      return badRequest("channel, fromAddress, and body are required");
    }
    if (!["EMAIL", "WHATSAPP", "SMS"].includes(String(body.channel).toUpperCase())) {
      return badRequest("channel must be EMAIL, WHATSAPP, or SMS");
    }

    const result = await captureInboundCaseMessage(tenantId, {
      channel: String(body.channel).toUpperCase() as "EMAIL" | "WHATSAPP" | "SMS",
      fromAddress: String(body.fromAddress),
      toAddress: body.toAddress ? String(body.toAddress) : null,
      subject: body.subject ? String(body.subject) : null,
      body: String(body.body),
      providerMessageId: body.providerMessageId ? String(body.providerMessageId) : null,
      rawPayload: body,
      attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return serverError("Failed to capture inbound case message", error);
  }
}
