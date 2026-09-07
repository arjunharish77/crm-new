import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { assignCaseToUser } from "@/lib/repositories/cases-postgres";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.newOwnerId || !body?.reason) return badRequest("newOwnerId and reason are required");
    const updated = await assignCaseToUser(user, id, { newOwnerId: body.newOwnerId, reason: body.reason });
    if (!updated) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && (error.message === "CASE_ASSIGNMENT_REASON_REQUIRED" || error.message === "CASE_ASSIGNMENT_TARGET_REQUIRED")) {
      return badRequest("A reassignment reason and target user are required");
    }
    if (error instanceof Error && error.message === "CASE_ASSIGNMENT_TARGET_NOT_FOUND") return badRequest("Target user not found");
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to reassign case", error);
  }
}
