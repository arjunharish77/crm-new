import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { listInboundWebhookEventsForTenant } from "@/lib/server/inbound-webhooks";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const events = await listInboundWebhookEventsForTenant(user, limit);
    return NextResponse.json(events);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch inbound webhook events", error);
  }
}
