import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  deleteActivityTypeForTenant,
  updateActivityTypeForTenant,
} from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const updated = await updateActivityTypeForTenant(user, id, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update activity type", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteActivityTypeForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete activity type", error);
  }
}
