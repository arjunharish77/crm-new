import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { sendTestInboundWebhookPayload } from "@/lib/server/inbound-webhooks";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Test payload must include a name field");
    const result = await sendTestInboundWebhookPayload(user, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to send test payload", error);
  }
}
