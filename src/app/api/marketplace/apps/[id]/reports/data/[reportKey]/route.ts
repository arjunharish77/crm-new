import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getAppReportData } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; reportKey: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id, reportKey } = await params;
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";
    const result = await getAppReportData(user, id, reportKey, { forceRefresh });
    return NextResponse.json(result);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app report data");
  }
}
