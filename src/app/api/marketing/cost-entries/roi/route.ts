import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getScopeCostSummary } from "@/lib/server/marketing-cost";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const { searchParams } = new URL(request.url);
    const scopeType = searchParams.get("scopeType");
    const scopeId = searchParams.get("scopeId");
    if ((scopeType !== "JOURNEY" && scopeType !== "CAMPAIGN") || !scopeId) return badRequest("scopeType (JOURNEY or CAMPAIGN) and scopeId are required");
    return NextResponse.json(await getScopeCostSummary(user, scopeType, scopeId));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to compute marketing ROI summary", error);
  }
}
