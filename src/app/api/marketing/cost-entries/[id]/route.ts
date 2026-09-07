import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteCostEntryForTenant } from "@/lib/server/marketing-cost";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    await deleteCostEntryForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete marketing cost entry", error);
  }
}
