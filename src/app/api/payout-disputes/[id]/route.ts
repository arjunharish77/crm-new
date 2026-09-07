import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { resolvePayoutDispute } from "@/lib/server/payout-disputes";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const dispute = await resolvePayoutDispute(user, id, {
      status: body?.status,
      resolutionNotes: body?.resolutionNotes,
    });
    if (!dispute) {
      return NextResponse.json({ message: "Dispute not found" }, { status: 404 });
    }
    return NextResponse.json(dispute);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "DISPUTE_ALREADY_RESOLVED") {
      return badRequest("This dispute has already been resolved");
    }
    return serverError("Failed to resolve payout dispute", error);
  }
}
