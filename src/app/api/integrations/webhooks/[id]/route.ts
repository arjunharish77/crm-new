import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess, INTEGRATIONS_FORBIDDEN_MESSAGE } from "@/lib/server/integrations-access";
import { deleteWebhookForTenant, updateWebhookForTenant } from "@/lib/server/crm";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { UnsafeDestinationError } from "@/lib/server/outbound-request-guard";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Request body is required");
    const webhook = await updateWebhookForTenant(user, id, body);
    return NextResponse.json(webhook);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "WEBHOOK_NOT_FOUND") return badRequest("Webhook not found");
    if (error instanceof UnsafeDestinationError) return badRequest(error.message);
    return serverError("Failed to update webhook", error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden(INTEGRATIONS_FORBIDDEN_MESSAGE);
    const { id } = await params;
    await deleteWebhookForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete webhook", error);
  }
}
