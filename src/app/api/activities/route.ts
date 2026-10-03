import { NextResponse } from "next/server";
import { createActivityForTenant, listActivitiesForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? "100");
    const page = Number(searchParams.get("page") ?? "1");
    const filters = searchParams.get("filters");
    let parsedFilters = null;
    try {
      parsedFilters = filters ? JSON.parse(filters) : null;
    } catch {
      return badRequest("Filters must be valid JSON");
    }

    // Search, sort and strict filters (Smart Views): ?q=, ?sort=<column>&dir=asc|desc, ?strict=1.
    const sortId = searchParams.get("sort");
    const response = await listActivitiesForTenant(user, limit, parsedFilters, page, {
      search: searchParams.get("q"),
      sort: sortId ? { id: sortId, desc: searchParams.get("dir") !== "asc" } : null,
      strictFilters: searchParams.get("strict") === "1",
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch activities", error);
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

    if (error instanceof Error && error.message === "ACTIVITY_LINK_REQUIRED") return badRequest("Choose the lead or opportunity this activity is for");
    if (error instanceof Error && error.message === "ACTIVITY_RECORD_NOT_ACCESSIBLE") return notFound("Lead or opportunity not found");
    console.error("Activity create failed", error);
    return serverError("Failed to create activity", error);
  }
}
