import { NextResponse } from "next/server";
import { listAuditLogsForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") ?? "";
    const entityId = searchParams.get("entityId") ?? "";
    const action = searchParams.get("action") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const limit = Math.max(1, Number(searchParams.get("limit") ?? 50));
    const logs = await listAuditLogsForTenant(user, { entityType, entityId, action });
    const start = (page - 1) * limit;
    const data = logs.slice(start, start + limit);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: logs.length,
        totalPages: Math.max(1, Math.ceil(logs.length / limit)),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch audit logs", error);
  }
}
