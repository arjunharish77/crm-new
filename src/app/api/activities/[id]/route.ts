import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateActivityForTenant } from "@/lib/server/crm";
import { badRequest, notFound, serverError, unauthorized, userMessage } from "@/lib/server/http";

const ACTIVITY_REFUSALS: Record<string, string> = {
  ACTIVITY_TYPE_SYSTEM: "This activity type is logged by the CRM itself and can't be picked by hand. For a call, email or message made outside the CRM, use the \"(logged manually)\" type.",
  ACTIVITY_TYPE_NOT_FOUND: "That activity type doesn't exist any more. Pick another.",
  ACTIVITY_SYSTEM_READ_ONLY: "This activity was logged by the CRM. Only its notes and custom fields can be changed.",
  CUSTOM_FIELD_VALUE_INVALID: "A custom field has a value of the wrong kind (for example text in a number field).",
};


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
    if (error instanceof Error && ACTIVITY_REFUSALS[error.message]) return userMessage(ACTIVITY_REFUSALS[error.message]);
    return serverError("Failed to update activity", error);
  }
}
