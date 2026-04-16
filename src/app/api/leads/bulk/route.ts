import { NextResponse } from "next/server";
import { deleteLeadsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);
    const ids = Array.isArray(payload?.ids)
      ? payload.ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : [];

    if (payload?.all) {
      return badRequest("Delete all leads is not supported in this version");
    }

    if (ids.length === 0) {
      return badRequest("At least one lead must be selected");
    }

    const deleted = await deleteLeadsForTenant(user, ids);
    return NextResponse.json({ success: true, deleted });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete leads");
  }
}
