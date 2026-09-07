import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { submitKnowledgeBaseArticleFeedback } from "@/lib/repositories/knowledge-base-postgres";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.isHelpful !== "boolean") return badRequest("isHelpful (boolean) is required");
    await submitKnowledgeBaseArticleFeedback(user, { articleId: id, caseId: body.caseId ?? null, isHelpful: body.isHelpful, comment: body.comment ?? null });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to submit article feedback", error);
  }
}
