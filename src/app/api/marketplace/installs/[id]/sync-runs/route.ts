import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listSyncRunsForInstall } from "@/lib/server/marketplace-sync";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const runs = await listSyncRunsForInstall(user, id);
    return NextResponse.json(runs);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load sync history");
  }
}
