import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { deleteDashboardLayoutSnapshotForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteDashboardLayoutSnapshotForTenant(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete saved dashboard layout", error);
  }
}
