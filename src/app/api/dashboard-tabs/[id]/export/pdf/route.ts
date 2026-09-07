import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { exportDashboardTabPdfForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 17's advanced dashboard builder, "export/schedule for a whole dashboard"
// sub-item -- one combined PDF (per explicit user direction), one page per widget on the tab.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await exportDashboardTabPdfForTenant(user, id);
    const friendlyName = result.tabName.replace(/[^a-zA-Z0-9._-]/g, "-");
    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Dashboard-${friendlyName}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DASHBOARD_TAB_NOT_FOUND") return NextResponse.json({ message: "Tab not found" }, { status: 404 });
    return serverError("Failed to export dashboard PDF", error);
  }
}
