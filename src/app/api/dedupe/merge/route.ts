import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { mergeRecordsForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.matchId || !body?.survivorId) return badRequest("matchId and survivorId are required");
    const result = await mergeRecordsForTenant(user, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "DEDUPE_MATCH_NOT_PENDING") return badRequest("This match is no longer pending review");
    if (error instanceof Error && error.message === "SURVIVOR_NOT_IN_MATCH") return badRequest("The chosen survivor is not one of the matched records");
    if (error instanceof Error && error.message === "NO_LOSER_IN_MATCH") return badRequest("This match has no other record to merge");
    if (error instanceof Error && error.message === "RECORD_NOT_FOUND") return badRequest("One of the matched records was not found");
    return serverError("Failed to merge records", error);
  }
}
