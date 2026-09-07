import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateAppReport, deleteAppReport } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

type Params = { params: Promise<{ id: string; reportId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id, reportId } = await params;
    const body = await request.json().catch(() => ({}));
    const report = await updateAppReport(user, id, reportId, body);
    return NextResponse.json(report);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update app report");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id, reportId } = await params;
    await deleteAppReport(user, id, reportId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to delete app report");
  }
}
