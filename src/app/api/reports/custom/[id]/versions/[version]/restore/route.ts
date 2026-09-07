import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { restoreCustomReportVersion } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id, version } = await params;
    const versionNumber = Number(version);
    if (!Number.isFinite(versionNumber)) return badRequest("version must be a number");
    const report = await restoreCustomReportVersion(user, id, versionNumber);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    if (error instanceof Error && error.message === "CUSTOM_REPORT_VERSION_NOT_FOUND") return NextResponse.json({ message: "Version not found" }, { status: 404 });
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to restore custom report version", error);
  }
}
