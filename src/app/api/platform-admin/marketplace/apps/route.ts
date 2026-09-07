import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listMarketplaceAppsForPlatformAdmin } from "@/lib/server/marketplace";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const apps = await listMarketplaceAppsForPlatformAdmin();
    return NextResponse.json(apps);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketplace apps", error);
  }
}
