import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateDedupeMatchRuleForTenant } from "@/lib/server/dedupe";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const rule = await updateDedupeMatchRuleForTenant(user, id, body);
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "DEDUPE_MATCH_RULE_NOT_FOUND") return badRequest("Match rule not found");
    if (error instanceof Error && error.message === "INVALID_THRESHOLD") return badRequest("Threshold must be between 0 and 1");
    return serverError("Failed to update dedupe match rule", error);
  }
}
