import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, getJourneyForTenant, updateJourneyForTenant } from "@/lib/server/marketing-journeys";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "view");
    const { id } = await params;
    const journey = await getJourneyForTenant(user, id);
    if (!journey) return NextResponse.json({ message: "Journey not found" }, { status: 404 });
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing journey", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "edit");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const journey = await updateJourneyForTenant(user, id, body);
    if (!journey) return NextResponse.json({ message: "Journey not found" }, { status: 404 });
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update marketing journey", error);
  }
}
