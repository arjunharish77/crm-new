import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  deleteCatalogEntityForTenant,
  isCatalogEntityKey,
  updateCatalogEntityForTenant,
} from "@/lib/repositories/catalog-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

function notFoundResponse() {
  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { entity, id } = await params;
    if (!isCatalogEntityKey(entity)) return notFoundResponse();
    const body = await request.json().catch(() => ({}));
    const updated = await updateCatalogEntityForTenant(user, entity, id, body);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    if (error instanceof Error && error.message.endsWith("_NOT_FOUND")) return badRequest("Record not found");
    return serverError("Failed to update catalog entity", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ entity: string; id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { entity, id } = await params;
    if (!isCatalogEntityKey(entity)) return notFoundResponse();
    await deleteCatalogEntityForTenant(user, entity, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete catalog entity", error);
  }
}
