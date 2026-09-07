import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createCostEntryForTenant, listCostEntriesForTenant } from "@/lib/server/marketing-cost";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const { searchParams } = new URL(request.url);
    const entries = await listCostEntriesForTenant(user, searchParams.get("scopeType") ?? undefined, searchParams.get("scopeId") ?? undefined);
    return NextResponse.json(entries);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing cost entries", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.scopeType || !body?.costType || body?.amount === undefined) return badRequest("scopeType, costType, and amount are required");
    const entry = await createCostEntryForTenant(user, body);
    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create marketing cost entry", error);
  }
}
