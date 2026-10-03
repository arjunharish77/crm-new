import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateAuditLogReview } from "@/lib/server/audit-review";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Reviewing the audit log is an admin task.
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const patch: Parameters<typeof updateAuditLogReview>[2] = {};
    if (body?.reviewStatus) patch.reviewStatus = body.reviewStatus;
    if ("reviewerId" in (body ?? {})) patch.reviewerId = body.reviewerId;
    if ("reviewNote" in (body ?? {})) patch.reviewNote = body.reviewNote;
    const updated = await updateAuditLogReview(user, id, patch);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can review the audit log");
    if (error instanceof Error && error.message === "AUDIT_LOG_NOT_FOUND") return badRequest("Audit log entry not found");
    return serverError("Failed to update audit log review status", error);
  }
}
