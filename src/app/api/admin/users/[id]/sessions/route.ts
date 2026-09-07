import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listSessionsForUserAsAdmin } from "@/lib/server/sessions";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireTenantAdmin(request);
    if (!admin.tenantId) return badRequest("A tenant context is required");
    const { id } = await params;
    const sessions = await listSessionsForUserAsAdmin(admin.tenantId, id);
    return NextResponse.json(sessions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch user sessions", error);
  }
}
