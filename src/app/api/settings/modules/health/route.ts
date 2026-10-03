import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getModuleHealthForTenantAdmin } from "@/lib/server/module-health";

// Tenant admins: this workspace's module health with a next step for each problem.
export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden();
    return NextResponse.json(await getModuleHealthForTenantAdmin(user.tenantId));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module health", error);
  }
}
