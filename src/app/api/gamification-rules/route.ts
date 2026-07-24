import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createGamificationRuleForTenant, listGamificationRulesForTenant } from "@/lib/server/gamification";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const rules = await listGamificationRulesForTenant(user);
    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch gamification rules", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.triggerEventType || body?.pointsAwarded === undefined) {
      return badRequest("name, triggerEventType, and pointsAwarded are required");
    }

    const rule = await createGamificationRuleForTenant(user, body);
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create gamification rule", error);
  }
}
