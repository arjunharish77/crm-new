import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCallScriptsForTenant, createCallScriptForTenant } from "@/lib/server/call-scripts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const scripts = await listCallScriptsForTenant(user);
    return NextResponse.json(scripts);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call scripts", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Name is required");
    const created = await createCallScriptForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to manage call scripts");
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    return serverError("Failed to create call script", error);
  }
}
