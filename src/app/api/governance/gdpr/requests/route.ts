import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listPrivacyRequestsForTenant } from "@/lib/server/privacy";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const rows = await listPrivacyRequestsForTenant(user);
    const requests = rows.map((row: any) => ({
      id: row.id,
      contactEmail: row.contactEmail || "(record no longer exists)",
      type: row.requestType,
      status: row.status,
      createdAt: row.createdAt,
      filePath: row.resultFileObjectId ? `/governance/gdpr/requests/${row.id}/download` : undefined,
      error: row.error,
    }));
    return NextResponse.json(requests);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch privacy requests", error);
  }
}
