import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPermissionGrantsForInstall } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const grants = await listPermissionGrantsForInstall(user, id);
    return NextResponse.json(grants);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch permission grants");
  }
}
