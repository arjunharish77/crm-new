import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPendingPermissionChangesForTenant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const changes = await listPendingPermissionChangesForTenant(user);
    return NextResponse.json(changes);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch pending permission changes");
  }
}
