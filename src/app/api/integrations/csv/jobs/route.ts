import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";
import { listImportJobsForTenant, queueImportForTenant } from "@/lib/server/crm";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const jobs = await listImportJobsForTenant(user);
    return NextResponse.json(jobs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch import jobs", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.module || !Array.isArray(body?.rows)) return badRequest("Module and rows are required");
    const job = await queueImportForTenant(user, body);
    return NextResponse.json(job);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    return serverError("Failed to queue import", error);
  }
}
