import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { decideApprovalItem, type ApprovalEntityType } from "@/lib/server/approval-inbox";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

const ENTITY_TYPES: ApprovalEntityType[] = ["PAYOUT", "CAMPAIGN", "TEMPLATE", "EXPORT_REQUEST", "SCORING_MODEL_VERSION", "PARTNER_CHANGE_REQUEST"];

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { entityType, entityId, decision, comment } = body ?? {};
    if (!ENTITY_TYPES.includes(entityType)) return badRequest("A valid entityType is required");
    if (typeof entityId !== "string" || !entityId) return badRequest("entityId is required");
    if (decision !== "APPROVE" && decision !== "REJECT") return badRequest("decision must be APPROVE or REJECT");
    const result = await decideApprovalItem(user, entityType, entityId, decision, comment);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PAYOUT_REJECTION_NOT_SUPPORTED") return badRequest("Payouts can't be rejected -- hold them instead from the Payout Cycles page");
    if (error instanceof Error && error.message === "SCORING_MODEL_VERSION_REJECTION_NOT_SUPPORTED") return badRequest("A scoring model version can't be rejected -- it simply stays unpromoted");
    if (error instanceof Error && error.message === "TEMPLATE_SELF_APPROVAL") return forbidden("You can't approve a template you wrote. Ask another admin to review it.");
    if (error instanceof Error && error.message === "TEMPLATE_APPROVAL_INVALID_TRANSITION") return NextResponse.json({ message: "This template is no longer waiting for approval" }, { status: 409 });
    if (error instanceof Error && error.message.endsWith("_NOT_FOUND")) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (error instanceof Error && (error.message.includes("NOT_PENDING") || error.message.startsWith("INVALID_"))) return badRequest(error.message);
    return serverError("Failed to record approval decision", error);
  }
}
