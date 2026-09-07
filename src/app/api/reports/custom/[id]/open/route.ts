import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { recordCustomReportOpened } from "@/lib/repositories/reports-dashboards-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

// Fire-and-forget usage tracking -- called when a user actually opens a report, not on every
// render, mirroring /api/saved-views/[id]/open's own established precedent for the SAVED_VIEW
// rows this same CustomReport table also stores.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await recordCustomReportOpened(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to record report open", error);
  }
}
