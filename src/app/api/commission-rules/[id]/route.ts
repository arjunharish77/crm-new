import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteCommissionRuleForTenant, updateCommissionRuleForTenant } from "@/lib/server/commission";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const updated = await updateCommissionRuleForTenant(user, id, body);

    if (!updated) {
      return NextResponse.json({ message: "Commission rule not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update commission rule", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const deleted = await deleteCommissionRuleForTenant(user, id);

    if (!deleted) {
      return NextResponse.json({ message: "Commission rule not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete commission rule", error);
  }
}
