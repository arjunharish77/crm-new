import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { cloneDashboardTabForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.name) return badRequest("name is required");
    const tab = await cloneDashboardTabForTenant(user, id, String(body.name));
    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    if (error instanceof Error && /TAB_NAME_REQUIRED/.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to clone dashboard tab", error);
  }
}
