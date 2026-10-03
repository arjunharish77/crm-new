import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listModulesForTenantAdmin } from "@/lib/server/module-access";

// Tenant admins: this workspace's modules (status, trial end, pending request). Read-only; only
// platform admins change entitlements.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listModulesForTenantAdmin(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load modules", error);
  }
}
