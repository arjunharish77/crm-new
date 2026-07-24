import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { createExportRequestForUser, listExportRequestsForUser } from "@/lib/server/exports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    return NextResponse.json(await listExportRequestsForUser(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch export requests", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const created = await createExportRequestForUser(user, body);
    return NextResponse.json(created, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "INVALID_EXPORT_MODULE") return badRequest("Invalid export module");
    if (error instanceof Error && error.message === "TENANT_REQUIRED") return badRequest("Exports require a tenant user");
    return serverError("Failed to queue export request", error);
  }
}
