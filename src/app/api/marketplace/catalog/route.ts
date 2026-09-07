import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPublishedAppsForCatalog } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const apps = await listPublishedAppsForCatalog(user);
    return NextResponse.json(apps);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load the app catalog");
  }
}
