import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getInboundWebhookSettingsForTenant } from "@/lib/server/inbound-webhooks";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const settings = await getInboundWebhookSettingsForTenant(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch inbound webhook settings", error);
  }
}
