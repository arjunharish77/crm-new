import { NextResponse } from "next/server";
import { badRequest, forbidden, serverError } from "@/lib/server/http";
import { recordTelephonyCallEvent, verifyTelephonyWebhookRequest } from "@/lib/server/telephony-webhook";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    let body: any = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return badRequest("Request body must be valid JSON");
    }

    const tenantId = body?.tenantId ? String(body.tenantId) : "";
    if (!tenantId) return badRequest("tenantId is required");

    const url = new URL(request.url);
    const auth = await verifyTelephonyWebhookRequest(tenantId, rawBody, {
      signature: request.headers.get("x-webhook-signature"),
      timestamp: request.headers.get("x-webhook-timestamp"),
      legacySecret: request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret"),
    });
    if (!auth.ok) {
      if (auth.reason === "STALE_TIMESTAMP") return forbidden("Request timestamp is missing or outside the allowed window");
      return forbidden("Invalid or missing webhook signature");
    }

    try {
      const log = await recordTelephonyCallEvent(tenantId, body);
      return NextResponse.json(log);
    } catch (error) {
      if (error instanceof Error && error.message === "NO_TENANT_USER") return badRequest("No active tenant user found for this event");
      throw error;
    }
  } catch (error) {
    return serverError("Failed to ingest telephony webhook", error);
  }
}
