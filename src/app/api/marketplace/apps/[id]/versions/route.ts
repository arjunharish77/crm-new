import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppVersionsForTenant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const versions = await listAppVersionsForTenant(user, id);
    return NextResponse.json(versions);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app versions");
  }
}
