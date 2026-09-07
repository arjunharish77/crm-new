import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertJourneyPermission, markEnrollmentStatus } from "@/lib/server/marketing-journeys";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    assertJourneyPermission(user, "edit");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!["EXITED", "CONVERTED", "UNSUBSCRIBED"].includes(body?.status)) return badRequest("Invalid status");
    const enrollment = await markEnrollmentStatus(user, id, body.status, body.exitReason);
    if (!enrollment) return NextResponse.json({ message: "Enrollment not found" }, { status: 404 });
    return NextResponse.json(enrollment);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update journey enrollment", error);
  }
}
