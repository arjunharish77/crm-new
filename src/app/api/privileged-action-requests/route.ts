import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { listPrivilegedActionRequests } from "@/lib/server/privileged-actions";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Platform admins see the platform-scoped queue (tenant suspend/unsuspend, impersonation
// start -- tenantId is null on those rows); everyone else sees their own tenant's queue
// (permission template / connector secret requests), gated the same way approving one is.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;

    if (user.isPlatformAdmin) {
      const requests = await listPrivilegedActionRequests({ tenantId: null }, status);
      return NextResponse.json(requests);
    }

    await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("A tenant context is required");
    const requests = await listPrivilegedActionRequests({ tenantId: user.tenantId }, status);
    return NextResponse.json(requests);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch privileged action requests", error);
  }
}
