import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { discardCustomReportDraftForTenant } from "@/lib/repositories/reports-dashboards-postgres";
import { badRequest, forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

// Discards the report's unpublished changes (decision 29); what runs is unchanged. Same access as
// editing it.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    return NextResponse.json(await discardCustomReportDraftForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only the report's owner or an admin can change it");
    if (error instanceof Error && error.message === "CUSTOM_REPORT_NOT_FOUND") return notFound("Report not found");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return badRequest("Advanced Reporting is not enabled for this workspace");
    return serverError("Failed to discard changes", error);
  }
}
