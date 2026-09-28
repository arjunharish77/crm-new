import { NextResponse } from "next/server";
import { createLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, conflict, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get("page") ?? "1");
    const limit = Number(searchParams.get("limit") ?? "10");
    const filters = searchParams.get("filters");
    const parsedFilters = filters ? JSON.parse(filters) : null;

    const response = await listLeadsForTenant(user, page, limit, parsedFilters);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch leads", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);

    if (!payload?.name) {
      return badRequest("Lead name is required");
    }

    const idempotencyKey = request.headers.get("idempotency-key");
    const lead = await createLeadForTenant(user, payload, idempotencyKey);
    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "IDEMPOTENCY_KEY_CONFLICT") {
      return conflict("This Idempotency-Key was already used with a different request body");
    }

    console.error("Lead create failed", error);
    return serverError("Failed to create lead", error);
  }
}
