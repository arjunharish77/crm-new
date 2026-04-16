import { NextResponse } from "next/server";
import { listAuditLogsForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") ?? "";
    const action = searchParams.get("action") ?? "";
    const logs = await listAuditLogsForTenant(user, { entityType, action });
    return NextResponse.json(logs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch audit logs");
  }
}
