import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listAppTenantBlocksForPlatformAdmin } from "@/lib/server/marketplace";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const blocks = await listAppTenantBlocksForPlatformAdmin();
    return NextResponse.json(blocks);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch app blocks", error);
  }
}
