import { NextResponse } from "next/server";
import { deleteOpportunitiesForTenant } from "@/lib/server/crm";
import { BULK_DELETE_OPPORTUNITIES_MAX } from "@/lib/repositories/opportunities-postgres";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// DELETE /api/opportunities/bulk with { ids } in the body, like /api/leads/bulk: delete many
// opportunities at once (Section 8 #5; the list used to send one DELETE per record).
// Record access applies as for a single delete. Returns how many were deleted and, for the rest,
// why not ("Not found", or still linked to tasks, notes or commission entries).
export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids) ? [...new Set<string>(body.ids.filter((id: unknown) => typeof id === "string" && id))] : [];
    if (!ids.length) return badRequest("Choose at least one opportunity");
    if (ids.length > BULK_DELETE_OPPORTUNITIES_MAX) return badRequest(`At most ${BULK_DELETE_OPPORTUNITIES_MAX.toLocaleString()} opportunities can be deleted at once.`);
    return NextResponse.json(await deleteOpportunitiesForTenant(user, ids));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Opportunities is not enabled for this workspace");
    return serverError("Failed to delete opportunities", error);
  }
}
