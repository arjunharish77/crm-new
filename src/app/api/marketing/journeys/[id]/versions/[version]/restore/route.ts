import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, restoreJourneyVersion } from "@/lib/server/marketing-journeys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "edit");
    const { id, version } = await params;
    const versionNumber = Number(version);
    if (!Number.isInteger(versionNumber) || versionNumber < 1) return badRequest("version must be a positive integer");
    const journey = await restoreJourneyVersion(user, id, versionNumber);
    if (!journey) return NextResponse.json({ message: "Journey not found" }, { status: 404 });
    return NextResponse.json(journey);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETING_JOURNEY_VERSION_NOT_FOUND") {
      return NextResponse.json({ message: "Version not found" }, { status: 404 });
    }
    return serverError("Failed to restore marketing journey version", error);
  }
}
