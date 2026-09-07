import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getCrossTenantAppHealthOverview } from "@/lib/server/marketplace-events";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const overview = await getCrossTenantAppHealthOverview();
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch health overview", error);
  }
}
