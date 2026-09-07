import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { recordDashboardTabOpened } from "@/lib/repositories/dashboard-tabs-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

// Fire-and-forget usage tracking -- called when a user actually switches to a tab, not on
// every render, mirroring /api/saved-views/[id]/open's own established precedent.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await recordDashboardTabOpened(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to record tab open", error);
  }
}
