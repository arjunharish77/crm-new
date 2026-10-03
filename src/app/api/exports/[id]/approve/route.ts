import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { approveExportRequest } from "@/lib/server/exports";

function hasExportGovernanceAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    if (!hasExportGovernanceAccess(user)) return forbidden("You don't have permission to approve sensitive exports");
    const { id } = await params;
    const result = await approveExportRequest(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "EXPORT_REQUEST_NOT_PENDING_APPROVAL") return badRequest("This export is not awaiting approval");
    return serverError("Failed to approve export", error);
  }
}
