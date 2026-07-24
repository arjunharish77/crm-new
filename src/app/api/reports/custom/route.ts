import { NextResponse } from "next/server";
import { createCustomReportForTenant, listCustomReportsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const reports = await listCustomReportsForTenant(user);
    return NextResponse.json(reports);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch custom reports");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.module || !body?.config) return badRequest("name, module, and config are required");
    const report = await createCustomReportForTenant(user, body);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && /REQUIRED/i.test(error.message)) return badRequest(error.message);
    return serverError("Failed to create custom report", error);
  }
}
