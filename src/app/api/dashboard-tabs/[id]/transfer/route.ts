import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { transferDashboardTabOwnerForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.newOwnerUserId) return badRequest("newOwnerUserId is required");
    const tab = await transferDashboardTabOwnerForTenant(user, id, String(body.newOwnerUserId));
    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    if (error instanceof Error && error.message === "DASHBOARD_TAB_TRANSFER_TARGET_NOT_FOUND") {
      return NextResponse.json({ message: "New owner not found in this workspace" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "DASHBOARD_TAB_TRANSFER_NAME_CONFLICT") {
      return badRequest("The new owner already has a tab with this name");
    }
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to transfer dashboard tab", error);
  }
}
