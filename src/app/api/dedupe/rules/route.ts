import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listDedupeMatchRulesForTenant } from "@/lib/server/dedupe";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const rules = await listDedupeMatchRulesForTenant(user);
    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch dedupe match rules", error);
  }
}
