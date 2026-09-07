import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listCallScriptVersionsForTenant } from "@/lib/server/call-scripts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const versions = await listCallScriptVersionsForTenant(user, id);
    return NextResponse.json(versions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to view call script history");
    return serverError("Failed to fetch call script versions", error);
  }
}
