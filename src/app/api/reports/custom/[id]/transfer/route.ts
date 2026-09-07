import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { transferCustomReportOwnerForTenant } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.newOwnerUserId) return badRequest("newOwnerUserId is required");
    const report = await transferCustomReportOwnerForTenant(user, id, String(body.newOwnerUserId));
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return NextResponse.json({ message: "Report not found" }, { status: 404 });
    if (error instanceof Error && error.message === "CUSTOM_REPORT_TRANSFER_TARGET_NOT_FOUND") {
      return NextResponse.json({ message: "New owner not found in this workspace" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to transfer custom report", error);
  }
}
