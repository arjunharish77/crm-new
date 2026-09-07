import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPendingApprovalsForTenant } from "@/lib/server/approval-inbox";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 10's "approval inbox" item -- a single, unified cross-module list.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const items = await listPendingApprovalsForTenant(user);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch approval inbox", error);
  }
}
