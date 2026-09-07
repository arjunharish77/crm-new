import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listDashboardLayoutSnapshotsForTenant, saveDashboardLayoutSnapshotForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const snapshots = await listDashboardLayoutSnapshotsForTenant(user);
    return NextResponse.json(snapshots);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch saved dashboard layouts", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.name) return badRequest("name is required");
    const snapshot = await saveDashboardLayoutSnapshotForTenant(user, String(body.name));
    return NextResponse.json(snapshot);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SNAPSHOT_NAME_REQUIRED") return badRequest("name is required");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to save dashboard layout", error);
  }
}
