import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { deleteCatalogEntityForTenant, updateCatalogEntityForTenant } from "@/lib/repositories/catalog-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const updated = await updateCatalogEntityForTenant(user, "programs", id, body);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    if (error instanceof Error && error.message === "PROGRAM_NOT_FOUND") return badRequest("Program not found");
    return serverError("Failed to update program", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    await deleteCatalogEntityForTenant(user, "programs", id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete program", error);
  }
}
