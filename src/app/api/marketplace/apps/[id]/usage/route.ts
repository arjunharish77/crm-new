import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getAppUsageForTenant } from "@/lib/server/marketplace-events";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const usage = await getAppUsageForTenant(user, id);
    return NextResponse.json(usage);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app usage");
  }
}
