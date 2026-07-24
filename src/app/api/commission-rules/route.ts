import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createCommissionRuleForTenant, listCommissionRulesForTenant } from "@/lib/server/commission";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const rules = await listCommissionRulesForTenant(user);
    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch commission rules", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.ruleType || body?.value === undefined) {
      return badRequest("name, ruleType, and value are required");
    }
    if (body.ruleType !== "FLAT" && body.ruleType !== "PERCENTAGE") {
      return badRequest("ruleType must be FLAT or PERCENTAGE");
    }

    const rule = await createCommissionRuleForTenant(user, body);
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create commission rule", error);
  }
}
