import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { approvePrivilegedActionRequest } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Platform admins can approve any request (platform-scoped or tenant-scoped, matching how
// platform admins already bypass tenant-level restrictions elsewhere in this app); a tenant
// admin can only approve their own tenant's requests -- enforced again inside the service via
// a tenant-match check, since this route can't tell which tenant a request belongs to without
// loading it first.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPlatformAdmin && !user.isTenantAdmin) return forbidden();
    const { id } = await params;
    const result = await approvePrivilegedActionRequest(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You can't approve a request outside your own tenant");
    if (error instanceof Error && error.message === "REQUEST_NOT_PENDING") return badRequest("This request is no longer pending");
    if (error instanceof Error && error.message === "CANNOT_APPROVE_OWN_REQUEST") return badRequest("You can't approve your own request -- a different admin must review it");
    return serverError("Failed to approve request", error);
  }
}
