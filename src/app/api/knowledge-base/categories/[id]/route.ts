import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { deleteKnowledgeBaseCategoryForTenant, updateKnowledgeBaseCategoryForTenant } from "@/lib/repositories/knowledge-base-postgres";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateKnowledgeBaseCategoryForTenant(user, id, body ?? {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    if (error instanceof Error && error.message === "KB_CATEGORY_NAME_REQUIRED") return badRequest("Enter a category name");
    if (error instanceof Error && error.message === "KB_CATEGORY_NAME_TAKEN") return NextResponse.json({ message: "A category with that name already exists" }, { status: 409 });
    if (error instanceof Error && error.message === "KB_CATEGORY_PARENT_INVALID") return badRequest("Choose a parent category from this workspace");
    if (error instanceof Error && error.message === "KB_CATEGORY_NOT_FOUND") return NextResponse.json({ message: "Category not found" }, { status: 404 });
    return serverError("Failed to update knowledge base category", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    await deleteKnowledgeBaseCategoryForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to delete knowledge base category", error);
  }
}
