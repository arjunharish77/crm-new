import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { updateTenantScopedUser } from "@/lib/server/admin";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const updated = await updateTenantScopedUser(user.tenantId, id, body);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update user");
  }
}
