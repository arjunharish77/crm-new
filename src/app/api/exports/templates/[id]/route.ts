import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { deleteExportTemplateForTenant } from "@/lib/server/exports";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const archived = await deleteExportTemplateForTenant(user, id);
    return NextResponse.json({ success: true, purgeAfter: archived?.purgeAfter ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    // Not found, or saved by someone else (only they or an admin can delete it).
    if (error instanceof Error && error.message === "EXPORT_TEMPLATE_NOT_FOUND") return NextResponse.json({ message: "Template not found" }, { status: 404 });
    return serverError("Failed to delete export template", error);
  }
}
