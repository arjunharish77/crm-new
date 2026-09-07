import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { addCommentToCase } from "@/lib/repositories/cases-postgres";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body?.body) return badRequest("Comment body is required");
    const comment = await addCommentToCase(user, id, { body: body.body, isInternal: body.isInternal });
    if (!comment) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(comment);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CASE_COMMENT_BODY_REQUIRED") return badRequest("Comment body is required");
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("Service Desk module is disabled for this tenant");
    return serverError("Failed to add comment", error);
  }
}
