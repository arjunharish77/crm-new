import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { restoreDashboardTabVersion } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id, version } = await params;
    const versionNumber = Number(version);
    if (!Number.isFinite(versionNumber)) return badRequest("version must be a number");
    const result = await restoreDashboardTabVersion(user, id, versionNumber);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    if (error instanceof Error && error.message === "DASHBOARD_TAB_VERSION_NOT_FOUND") return NextResponse.json({ message: "Version not found" }, { status: 404 });
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to restore dashboard tab version", error);
  }
}
