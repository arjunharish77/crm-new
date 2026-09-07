import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { setCustomReportDeprecationForTenant } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.status) return badRequest("status is required");
    const report = await setCustomReportDeprecationForTenant(user, id, body.status, body.reason ?? null);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    if (error instanceof Error && /Invalid deprecationStatus/.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to update custom report deprecation status", error);
  }
}
