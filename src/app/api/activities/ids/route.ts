import { NextResponse } from "next/server";
import { listActivityIdsForTenant } from "@/lib/repositories/activities-postgres";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Ids of every activity matching the list's filters, for "select all N matching" bulk actions.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const filters = new URL(request.url).searchParams.get("filters");
    let parsedFilters = null;
    try {
      parsedFilters = filters ? JSON.parse(filters) : null;
    } catch {
      return badRequest("Filters must be valid JSON");
    }
    return NextResponse.json(await listActivityIdsForTenant(user, parsedFilters));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to list activity ids", error);
  }
}
