import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateActivityForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") return badRequest("Activity update payload is required");

    const activity = await updateActivityForTenant(user, id, payload);
    return NextResponse.json(activity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "ACTIVITY_NOT_FOUND") return badRequest("Activity not found");
    return serverError("Failed to update activity", error);
  }
}
