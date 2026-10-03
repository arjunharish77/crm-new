import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { discardDashboardTabDraftForTenant, saveDashboardTabDraftForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

// Dashboard edit mode's draft (decision 29): layout changes and removals kept until Publish.
// Only the tab's owner, and only their own widgets on the tab.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await saveDashboardTabDraftForTenant(user, id, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    return serverError("Failed to save the dashboard draft", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    return NextResponse.json(await discardDashboardTabDraftForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    return serverError("Failed to discard the dashboard draft", error);
  }
}
