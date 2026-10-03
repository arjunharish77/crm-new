import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { deleteLeadStatusForTenant, updateLeadStatusForTenant } from "@/lib/repositories/lead-statuses-postgres";
import { leadStatusError } from "../errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateLeadStatusForTenant(user, id, body ?? {}));
  } catch (error) {
    return leadStatusError(error, "Failed to update lead status");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    return NextResponse.json(await deleteLeadStatusForTenant(user, id));
  } catch (error) {
    return leadStatusError(error, "Failed to delete lead status");
  }
}
