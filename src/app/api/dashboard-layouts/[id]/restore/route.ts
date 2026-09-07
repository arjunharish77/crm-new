import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { restoreDashboardLayoutSnapshotForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await restoreDashboardLayoutSnapshotForTenant(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SNAPSHOT_NOT_FOUND") return NextResponse.json({ message: "Saved layout not found" }, { status: 404 });
    return serverError("Failed to restore dashboard layout", error);
  }
}
