import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppReportsForTenant, createAppReport } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const reports = await listAppReportsForTenant(user, id);
    return NextResponse.json(reports);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app reports");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const report = await createAppReport(user, id, body);
    return NextResponse.json(report);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to create app report");
  }
}
