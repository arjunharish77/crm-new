import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { reorderCustomFieldsForTenant } from "@/lib/server/admin-modules";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return badRequest("A non-empty ids array is required");
    await reorderCustomFieldsForTenant(user, ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to reorder type custom fields", error);
  }
}
