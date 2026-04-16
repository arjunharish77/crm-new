import { NextResponse } from "next/server";
import { createLeadForTenant, listLeadsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

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

    return serverError("Failed to fetch leads");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);

    if (!payload?.name) {
      return badRequest("Lead name is required");
    }

    const lead = await createLeadForTenant(user, payload);
    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    console.error("Lead create failed", error);
    return serverError("Failed to create lead", error);
  }
}
