import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateActivityForTenant } from "@/lib/server/crm";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";

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
    if (error instanceof Error && error.message === "ACTIVITY_NOT_FOUND") return notFound("Activity not found");
    if (error instanceof Error && error.message === "ACTIVITY_LINK_REQUIRED") return badRequest("Choose the lead or opportunity this activity is for");
    if (error instanceof Error && error.message === "ACTIVITY_RECORD_NOT_ACCESSIBLE") return notFound("Lead or opportunity not found");
    return serverError("Failed to update activity", error);
  }
}
