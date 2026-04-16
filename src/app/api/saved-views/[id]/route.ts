import { NextResponse } from "next/server";
import { deleteSavedViewForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteSavedViewForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete saved view", error);
  }
}
