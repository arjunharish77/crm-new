import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { deleteArchivedItemForTenant, isArchiveKind, restoreItemForTenant } from "@/lib/server/archive-items";
import { assertArchiveModuleAccess } from "@/lib/server/archive-access";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

type Params = { params: Promise<{ kind: string; id: string }> };

// Restore an archived item as it was (decision 31). Same access as deleting it.
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { kind, id } = await params;
    if (!isArchiveKind(kind)) return notFound("Unknown kind of item");
    assertArchiveModuleAccess(user, kind, "write");
    return NextResponse.json(await restoreItemForTenant(user, kind, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only the item's owner or an admin can restore it");
    return serverError("Failed to restore item", error);
  }
}

// Delete an archived item for good, before the 30-day purge.
export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { kind, id } = await params;
    if (!isArchiveKind(kind)) return notFound("Unknown kind of item");
    assertArchiveModuleAccess(user, kind, "full");
    await deleteArchivedItemForTenant(user, kind, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only the item's owner or an admin can delete it");
    return serverError("Failed to delete item", error);
  }
}
