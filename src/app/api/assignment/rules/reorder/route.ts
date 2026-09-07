import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { reorderAssignmentRulesForTenant } from "@/lib/server/admin-modules";

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.ids) || body.ids.length === 0) return badRequest("ids is required");
    await reorderAssignmentRulesForTenant(user, body.ids);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Distribution module is disabled for this tenant");
    return serverError("Failed to reorder assignment rules", error);
  }
}
