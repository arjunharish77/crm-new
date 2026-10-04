import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createWebhookForTenant, listWebhooksForTenant } from "@/lib/server/crm";
import { UnsafeDestinationError } from "@/lib/server/outbound-request-guard";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const webhooks = await listWebhooksForTenant(user);
    return NextResponse.json(webhooks);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch webhooks", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.url) return badRequest("Webhook name and URL are required");
    const webhook = await createWebhookForTenant(user, body);
    return NextResponse.json(webhook);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof UnsafeDestinationError) return badRequest(error.message);
    return serverError("Failed to create webhook", error);
  }
}
