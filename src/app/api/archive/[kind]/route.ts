import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { isArchiveKind, listArchivedItemsForTenant } from "@/lib/server/archive-items";
import { assertArchiveModuleAccess } from "@/lib/server/archive-access";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

// The Archived list for one kind of configuration item (decision 31): what this person may
// restore -- their own items, or everything for an admin (admin-only kinds refuse others).
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { kind } = await params;
    if (!isArchiveKind(kind)) return notFound("Unknown kind of item");
    assertArchiveModuleAccess(user, kind, "read");
    return NextResponse.json(await listArchivedItemsForTenant(user, kind));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only an admin can see these archived items");
    return serverError("Failed to list archived items", error);
  }
}
