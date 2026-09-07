import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { setDashboardTabDeprecationForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.status) return badRequest("status is required");
    const tab = await setDashboardTabDeprecationForTenant(user, id, body.status, body.reason ?? null);
    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    if (error instanceof Error && /Invalid deprecationStatus|TENANT_CONTEXT_REQUIRED/.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to update dashboard tab deprecation status", error);
  }
}
