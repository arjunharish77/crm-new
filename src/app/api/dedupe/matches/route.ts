import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listDedupeMatchesForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const url = new URL(request.url);
    const entityType = url.searchParams.get("entityType");
    if (entityType !== "LEAD" && entityType !== "OPPORTUNITY" && entityType !== "CASE") return badRequest("entityType must be LEAD, OPPORTUNITY, or CASE");
    const status = url.searchParams.get("status") as "PENDING" | "MERGED" | "DISMISSED" | null;
    const matches = await listDedupeMatchesForTenant(user, entityType, status ?? undefined);
    return NextResponse.json(matches);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch dedupe matches", error);
  }
}
