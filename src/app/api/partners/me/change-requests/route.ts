import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listMyPartnerChangeRequests, submitPartnerChangeRequest } from "@/lib/server/partner-change-requests";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 10's "approval inbox" item, "partner changes" sub-item -- a partner's own
// self-service request to change their profile, which only takes effect once a tenant admin
// approves it (see /api/approvals/decide).
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPartner) return forbidden("Not a partner account");
    const requests = await listMyPartnerChangeRequests(user);
    return NextResponse.json(requests);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch your change requests", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPartner) return forbidden("Not a partner account");
    const body = await request.json().catch(() => ({}));
    const created = await submitPartnerChangeRequest(user, body ?? {});
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PARTNER_PROFILE_NOT_FOUND") return NextResponse.json({ message: "Partner profile not found" }, { status: 404 });
    if (error instanceof Error && error.message === "NO_PROPOSED_CHANGES") return badRequest("At least one proposed change is required");
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Partners module is disabled for this tenant");
    return serverError("Failed to submit change request", error);
  }
}
