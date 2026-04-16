import { NextResponse } from "next/server";
import { deleteDashboardWidgetForTenant, updateDashboardWidgetForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);

    if (!body) {
      return badRequest("Request body is required");
    }

    const { id } = await params;
    const widget = await updateDashboardWidgetForTenant(user, id, body);
    return NextResponse.json(widget);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update dashboard widget");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteDashboardWidgetForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete dashboard widget");
  }
}
