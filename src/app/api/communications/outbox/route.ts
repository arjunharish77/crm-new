import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCommunicationOutboxForTenant, queueCommunicationForTenant } from "@/lib/server/communications";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 100);
    return NextResponse.json(await listCommunicationOutboxForTenant(user, limit));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch communication outbox", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.channel || !body?.recipient) return badRequest("channel and recipient are required");
    return NextResponse.json(await queueCommunicationForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to queue communication", error);
  }
}
