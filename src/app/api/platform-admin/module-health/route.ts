import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listModuleHealthAcrossTenants } from "@/lib/server/module-health";

// Platform admins: unhealthy modules across every active tenant, from the worker's snapshots.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return NextResponse.json(await listModuleHealthAcrossTenants());
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module health", error);
  }
}
