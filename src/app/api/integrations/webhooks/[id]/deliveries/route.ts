import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { listWebhookDeliveriesForSubscription } from "@/lib/server/webhook-outbox";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const deliveries = await listWebhookDeliveriesForSubscription(user, id, limit);
    return NextResponse.json(deliveries);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch webhook deliveries", error);
  }
}
