import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { setTemplateApprovalStatusForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

const STATUSES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!STATUSES.includes(body?.status)) return badRequest(`status must be one of ${STATUSES.join(", ")}`);
    const template = await setTemplateApprovalStatusForTenant(user, id, body.status);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "TEMPLATE_SELF_APPROVAL") return forbidden("You can't approve a template you wrote. Ask another admin to review it.");
    if (error instanceof Error && error.message === "TEMPLATE_APPROVAL_INVALID_TRANSITION") {
      return NextResponse.json({ message: "That status change isn't allowed: request approval from Draft or Rejected, then approve or reject" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "COMMUNICATION_TEMPLATE_NOT_FOUND") {
      return NextResponse.json({ message: "Template not found" }, { status: 404 });
    }
    return serverError("Failed to update communication template approval status", error);
  }
}
