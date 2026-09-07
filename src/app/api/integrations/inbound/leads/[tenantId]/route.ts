import { NextResponse } from "next/server";
import { badRequest, forbidden, serverError } from "@/lib/server/http";
import { captureInboundLead, verifyInboundWebhookRequest } from "@/lib/server/inbound-webhooks";

type Params = {
  params: Promise<{ tenantId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const { tenantId } = await params;
    const url = new URL(request.url);
    const rawBody = await request.text();

    const auth = await verifyInboundWebhookRequest(tenantId, rawBody, {
      signature: request.headers.get("x-webhook-signature"),
      timestamp: request.headers.get("x-webhook-timestamp"),
      legacySecret: request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret"),
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

    const idempotencyKey = request.headers.get("x-idempotency-key");

    try {
      const result = await captureInboundLead(tenantId, body, idempotencyKey);
      if (result.duplicate) return NextResponse.json({ duplicate: true, leadId: result.leadId });
      return NextResponse.json(result.lead);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to capture inbound lead";
      if (message.startsWith("VALIDATION:")) return badRequest(message.slice("VALIDATION:".length));
      if (message === "NO_TENANT_USER") return badRequest("No active tenant user found for inbound capture");
      throw error;
    }
  } catch (error) {
    return serverError("Failed to capture inbound lead", error);
  }
}
