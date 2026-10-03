import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { discardFormDraftForTenant } from "@/lib/repositories/forms-postgres";
import { formRouteError } from "@/lib/server/form-route-errors";

// Discards unpublished changes (decision 29); the public form is unchanged. Same access as editing.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    return NextResponse.json(await discardFormDraftForTenant(user, id));
  } catch (error) {
    return formRouteError(error, "Failed to discard changes");
  }
}
