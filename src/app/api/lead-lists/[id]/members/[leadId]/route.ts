import { NextResponse } from "next/server";
import { removeLeadFromLeadListForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; leadId: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id, leadId } = await params;
    await removeLeadFromLeadListForTenant(user, id, leadId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to remove lead from list", error);
  }
}
