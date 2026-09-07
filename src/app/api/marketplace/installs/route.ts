import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppInstallsForTenant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const installs = await listAppInstallsForTenant(user, status);
    return NextResponse.json(installs);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app installs");
  }
}
