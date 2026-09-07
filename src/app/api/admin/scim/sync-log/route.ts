import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listScimSyncLog } from "@/lib/server/scim";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return unauthorized();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const log = await listScimSyncLog(user.tenantId, limit);
    return NextResponse.json(log);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to load SCIM sync log", error);
  }
}
