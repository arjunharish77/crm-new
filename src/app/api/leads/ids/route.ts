import { NextResponse } from "next/server";
import { listLeadIdsForTenant } from "@/lib/repositories/leads-postgres";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Ids of every lead matching the list's filters, for "select all N matching" bulk actions.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const searchParams = new URL(request.url).searchParams;
    const filters = searchParams.get("filters");
    let parsedFilters = null;
    try {
      parsedFilters = filters ? JSON.parse(filters) : null;
    } catch {
      return badRequest("Filters must be valid JSON");
    }
    return NextResponse.json(await listLeadIdsForTenant(user, parsedFilters, 5000, searchParams.get("q")));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to list lead ids", error);
  }
}
