import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCallCenterWorkspaceForTenant } from "@/lib/server/call-center";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const workspace = await getCallCenterWorkspaceForTenant(user);
    return NextResponse.json(workspace);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch call center workspace", error);
  }
}
