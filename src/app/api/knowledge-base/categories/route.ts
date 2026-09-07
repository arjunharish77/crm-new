import { NextResponse } from "next/server";
import { requireInternalUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createKnowledgeBaseCategoryForTenant, listKnowledgeBaseCategoriesForTenant } from "@/lib/repositories/knowledge-base-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    return NextResponse.json(await listKnowledgeBaseCategoriesForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch knowledge base categories", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("name is required");
    return NextResponse.json(await createKnowledgeBaseCategoryForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to create knowledge base category", error);
  }
}
