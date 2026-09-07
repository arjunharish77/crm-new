import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, JourneyPermissionAction, JourneyStatus, transitionJourneyStatus } from "@/lib/server/marketing-journeys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Governance-weight transitions (activating/pausing a live send flow) require `manage`;
// APPROVED requires `approve`; everything else (SCHEDULED, ARCHIVED) only needs `edit`.
function actionForTransition(nextStatus: JourneyStatus): JourneyPermissionAction {
  if (nextStatus === "ACTIVE") return "launch";
  if (nextStatus === "PAUSED") return "pause";
  if (nextStatus === "APPROVED") return "approve";
  return "edit";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.status) return badRequest("status is required");
    assertJourneyPermission(user, actionForTransition(body.status));
    const journey = await transitionJourneyStatus(user, id, body.status);
    if (!journey) return NextResponse.json({ message: "Journey not found" }, { status: 404 });
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("INVALID_JOURNEY_TRANSITION")) return badRequest(error.message);
    return serverError("Failed to update marketing journey status", error);
  }
}
