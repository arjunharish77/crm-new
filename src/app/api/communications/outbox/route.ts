import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { listCommunicationOutboxForTenant, queueCommunicationForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// The workspace's outgoing messages (recipients, bodies, source records) are for admins; it
// answered to anyone signed in before. A record's own messages are on its page (/events).
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return NextResponse.json(await listCommunicationOutboxForTenant(user, limit));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch communication outbox", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.channel || !body?.recipient) return badRequest("channel and recipient are required");
    // The caller wrote this message, so {{snippet:key}} in it expands.
    return NextResponse.json(await queueCommunicationForTenant(user, { ...body, expandSnippets: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "COMMUNICATION_TEMPLATE_NOT_FOUND") return badRequest("Template not found");
    if (error instanceof Error && error.message === "TEMPLATE_CHANNEL_MISMATCH") return badRequest("That template is for a different channel");
    if (error instanceof Error && error.message === "TEMPLATE_NOT_APPROVED") return badRequest("This template isn't approved yet. Your workspace sends only approved templates (Settings › Integrations › Email, SMS & WhatsApp).");
    return serverError("Failed to queue communication", error);
  }
}
