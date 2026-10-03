import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { rejectImportJob } from "@/lib/server/crm";

function hasImportApprovalAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    if (!hasImportApprovalAccess(user)) return forbidden("You don't have permission to reject destructive imports");
    const { id } = await params;
    const job = await rejectImportJob(user, id);
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "IMPORT_JOB_NOT_PENDING_APPROVAL") {
      return badRequest("This import is not awaiting approval");
    }
    return serverError("Failed to reject import", error);
  }
}
