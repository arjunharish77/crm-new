import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { setAuditLogLegalHold } from "@/lib/server/audit-review";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.legalHold !== "boolean") return badRequest("legalHold (boolean) is required");
    const updated = await setAuditLogLegalHold(user, id, body.legalHold);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "AUDIT_LOG_NOT_FOUND") return badRequest("Audit log entry not found");
    return serverError("Failed to update legal hold", error);
  }
}
