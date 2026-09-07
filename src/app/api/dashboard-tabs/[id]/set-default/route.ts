import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { setDefaultDashboardTabForTenant } from "@/lib/repositories/dashboard-tabs-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 10's user workspace personalization item, "preferred dashboard" sub-item.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const tab = await setDefaultDashboardTabForTenant(user, id);
    return NextResponse.json(tab);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    return serverError("Failed to set default dashboard tab", error);
  }
}
