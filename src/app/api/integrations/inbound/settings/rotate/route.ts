import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { rotateInboundWebhookSecret } from "@/lib/server/inbound-webhooks";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const settings = await rotateInboundWebhookSecret(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to rotate inbound webhook secret", error);
  }
}
