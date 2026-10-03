import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { serverError, unauthorized, forbidden } from "@/lib/server/http";
import { deleteImportTemplateForTenant } from "@/lib/server/crm";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const archived = await deleteImportTemplateForTenant(user, id);
    return NextResponse.json({ success: true, purgeAfter: archived?.purgeAfter ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    return serverError("Failed to delete import template", error);
  }
}
