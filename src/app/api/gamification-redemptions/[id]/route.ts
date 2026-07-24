import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateGamificationRedemptionStatus } from "@/lib/server/gamification";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.status !== "FULFILLED" && body.status !== "FAILED") {
      return badRequest("status must be FULFILLED or FAILED");
    }

    const redemption = await updateGamificationRedemptionStatus(user, id, {
      status: body.status,
      thirdPartyReference: body.thirdPartyReference ?? null,
      failureReason: body.failureReason ?? null,
    });

    if (!redemption) {
      return NextResponse.json({ message: "Redemption not found" }, { status: 404 });
    }

    return NextResponse.json(redemption);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "REDEMPTION_ALREADY_REVIEWED") {
      return badRequest("This redemption has already been reviewed");
    }
    return serverError("Failed to update redemption", error);
  }
}
