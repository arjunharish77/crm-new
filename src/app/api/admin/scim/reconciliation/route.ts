import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getScimReconciliationSummary } from "@/lib/server/scim";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return unauthorized();
    const summary = await getScimReconciliationSummary(user.tenantId);
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to load SCIM reconciliation summary", error);
  }
}
