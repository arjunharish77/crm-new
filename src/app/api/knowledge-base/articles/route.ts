import { NextResponse } from "next/server";
import { requireInternalUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createKnowledgeBaseArticleVersion, listKnowledgeBaseArticlesForTenant } from "@/lib/repositories/knowledge-base-postgres";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const categoryId = new URL(request.url).searchParams.get("categoryId");
    return NextResponse.json(await listKnowledgeBaseArticlesForTenant(user, categoryId));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch knowledge base articles", error);
  }
}

// Creates a new version -- editing a published article never overwrites history (checklist
// item 9's "article versioning").
export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.title || !body?.body) return badRequest("title and body are required");
    return NextResponse.json(await createKnowledgeBaseArticleVersion(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to create knowledge base article version", error);
  }
}
