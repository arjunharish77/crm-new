import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCustomReportVersions, publishCustomReportVersion } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const versions = await listCustomReportVersions(user, id);
    return NextResponse.json(versions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    return serverError("Failed to fetch custom report versions", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const report = await publishCustomReportVersion(user, id, body?.publishNotes ?? null);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to publish custom report version", error);
  }
}
