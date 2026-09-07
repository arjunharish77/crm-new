import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listDashboardTabVersions, publishDashboardTabVersion } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const versions = await listDashboardTabVersions(user, id);
    return NextResponse.json(versions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    return serverError("Failed to fetch dashboard tab versions", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const tab = await publishDashboardTabVersion(user, id, body?.publishNotes ?? null);
    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to publish dashboard tab version", error);
  }
}
