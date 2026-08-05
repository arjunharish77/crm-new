import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCommunicationEventsForTenant } from "@/lib/server/communications";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    if (!entityType || !entityId) return badRequest("entityType and entityId are required");
    return NextResponse.json(await listCommunicationEventsForTenant(user, {
      entityType,
      entityId,
      limit: Number(searchParams.get("limit") ?? 50),
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch communication events", error);
  }
}
