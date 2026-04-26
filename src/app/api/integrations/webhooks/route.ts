import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { createWebhookForTenant, listWebhooksForTenant } from "@/lib/server/crm";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
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
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.url) return badRequest("Webhook name and URL are required");
    const webhook = await createWebhookForTenant(user, body);
    return NextResponse.json(webhook);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create webhook", error);
  }
}
