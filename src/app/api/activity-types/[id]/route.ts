import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import {
  deleteActivityTypeForTenant,
  updateActivityTypeForTenant,
} from "@/lib/server/crm";
import { serverError, unauthorized, forbidden, userMessage } from "@/lib/server/http";

const SYSTEM_TYPE_REFUSAL = "This is a system activity type the CRM uses itself, so it can't be renamed, switched off or deleted. Its icon, colour and defaults can be changed.";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateActivityTypeForTenant(user, id, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "ACTIVITY_TYPE_SYSTEM") return userMessage(SYSTEM_TYPE_REFUSAL);

    return serverError("Failed to update activity type", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    await deleteActivityTypeForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "ACTIVITY_TYPE_SYSTEM") return userMessage(SYSTEM_TYPE_REFUSAL);

    return serverError("Failed to delete activity type", error);
  }
}
