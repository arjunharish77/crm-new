import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, simulateJourneyAudience } from "@/lib/server/marketing-journeys";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "view");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await simulateJourneyAudience(user, id, { sampleSize: body?.sampleSize });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETING_JOURNEY_NOT_FOUND") {
      return NextResponse.json({ message: "Journey not found" }, { status: 404 });
    }
    return serverError("Failed to simulate marketing journey audience", error);
  }
}
