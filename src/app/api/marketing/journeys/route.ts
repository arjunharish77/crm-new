import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, createJourneyForTenant, listJourneysForTenant } from "@/lib/server/marketing-journeys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "view");
    const journeys = await listJourneysForTenant(user);
    return NextResponse.json(journeys);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing journeys", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "create");
    const body = await request.json().catch(() => ({}));
    if (!body?.name || !body?.targetModule) return badRequest("name and targetModule are required");
    const journey = await createJourneyForTenant(user, body);
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create marketing journey", error);
  }
}
