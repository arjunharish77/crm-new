import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { listPendingVersionsForPlatformAdmin } from "@/lib/server/marketplace";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const versions = await listPendingVersionsForPlatformAdmin();
    return NextResponse.json(versions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch pending versions", error);
  }
}
