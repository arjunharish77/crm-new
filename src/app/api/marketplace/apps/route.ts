import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listMarketplaceAppsForTenant, registerMarketplaceApp } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const apps = await listMarketplaceAppsForTenant(user);
    return NextResponse.json(apps);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch marketplace apps");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    const result = await registerMarketplaceApp(user, body);
    return NextResponse.json(result);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to register marketplace app");
  }
}
