import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteBadgeForTenant, updateBadgeForTenant } from "@/lib/server/badges";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const updated = await updateBadgeForTenant(user, id, body);

    if (!updated) {
      return NextResponse.json({ message: "Badge not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update badge", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const deleted = await deleteBadgeForTenant(user, id);

    if (!deleted) {
      return NextResponse.json({ message: "Badge not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete badge", error);
  }
}
