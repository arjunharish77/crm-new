import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { runDedupeScanForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (body?.entityType !== "LEAD" && body?.entityType !== "OPPORTUNITY" && body?.entityType !== "CASE") return badRequest("entityType must be LEAD, OPPORTUNITY, or CASE");
    const result = await runDedupeScanForTenant(user, body.entityType);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to run dedupe scan", error);
  }
}
