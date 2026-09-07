import { NextResponse } from "next/server";
import { enrollRecordsInAutomation } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

// Synchronous by design, matching this codebase's existing bulk-action convention (e.g.
// bulkUpdateTasksForTenant) rather than a background worker job -- capped at 500 records per
// call (enforced in enrollRecordsInAutomation) to keep the request bounded.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const entityType = body?.entityType === "OPPORTUNITY" ? "OPPORTUNITY" : body?.entityType === "LEAD" ? "LEAD" : null;
    if (!entityType) return badRequest("entityType must be LEAD or OPPORTUNITY");
    if (!Array.isArray(body?.recordIds) || body.recordIds.length === 0) return badRequest("recordIds is required");
    const result = await enrollRecordsInAutomation(user, id, entityType, body.recordIds);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "AUTOMATION_NOT_FOUND") {
      return NextResponse.json({ message: "Automation not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "NO_RECORDS_PROVIDED") return badRequest("No valid record ids provided");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Automations is not enabled for this workspace");
    }
    return serverError("Failed to enroll records", error);
  }
}
