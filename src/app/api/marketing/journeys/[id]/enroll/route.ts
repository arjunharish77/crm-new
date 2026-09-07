import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, enrollAudienceIntoJourney } from "@/lib/server/marketing-journeys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "launch");
    const { id } = await params;
    const result = await enrollAudienceIntoJourney(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETING_JOURNEY_NOT_ACTIVE") {
      return badRequest("The journey must be ACTIVE before enrolling an audience");
    }
    return serverError("Failed to enroll audience into marketing journey", error);
  }
}
