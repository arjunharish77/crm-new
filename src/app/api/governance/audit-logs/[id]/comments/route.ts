import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { addAuditLogComment, listAuditLogComments } from "@/lib/server/audit-review";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Reviewing the audit log is an admin task.
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const comments = await listAuditLogComments(user, id);
    return NextResponse.json(comments);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can review the audit log");
    return serverError("Failed to fetch comments", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Reviewing the audit log is an admin task.
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.body || !String(body.body).trim()) return badRequest("Comment body is required");
    const comment = await addAuditLogComment(user, id, String(body.body));
    return NextResponse.json(comment);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can review the audit log");
    if (error instanceof Error && error.message === "AUDIT_LOG_NOT_FOUND") return badRequest("Audit log entry not found");
    if (error instanceof Error && error.message === "COMMENT_REQUIRED") return badRequest("Comment body is required");
    return serverError("Failed to add comment", error);
  }
}
