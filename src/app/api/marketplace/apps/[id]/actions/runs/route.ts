import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppActionRunsForTenant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const runs = await listAppActionRunsForTenant(user, id, limit);
    return NextResponse.json(runs);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app action runs");
  }
}
