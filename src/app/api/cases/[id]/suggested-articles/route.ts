import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { suggestKnowledgeBaseArticlesForCase } from "@/lib/repositories/knowledge-base-postgres";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const articles = await suggestKnowledgeBaseArticlesForCase(user, id);
    return NextResponse.json(articles);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch suggested articles", error);
  }
}
