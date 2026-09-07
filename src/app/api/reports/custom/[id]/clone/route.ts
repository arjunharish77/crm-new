import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { cloneCustomReportForTenant } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.name) return badRequest("name is required");
    const report = await cloneCustomReportForTenant(user, id, String(body.name));
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    if (error instanceof Error && /REPORT_NAME_REQUIRED/.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to clone custom report", error);
  }
}
