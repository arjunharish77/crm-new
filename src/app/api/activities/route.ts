import { NextResponse } from "next/server";
import { createActivityForTenant, listActivitiesForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const filters = searchParams.get("filters");
    const parsedFilters = filters ? JSON.parse(filters) : null;

    const response = await listActivitiesForTenant(user, limit, parsedFilters);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch activities");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);

    if (!payload?.typeId) {
      return badRequest("Activity type is required");
    }

    const activity = await createActivityForTenant(user, payload);
    return NextResponse.json(activity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    console.error("Activity create failed", error);
    return serverError("Failed to create activity", error);
  }
}
