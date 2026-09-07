import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createCaseStatusForTenant, listCaseStatusesForTenant } from "@/lib/repositories/cases-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listCaseStatusesForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch case statuses", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.category) return badRequest("Case status name and category are required");
    return NextResponse.json(await createCaseStatusForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to create case status", error);
  }
}
