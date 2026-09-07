import { NextResponse } from "next/server";
import { addSavedViewCommentForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.body?.trim()) return badRequest("Comment body is required");
    const view = await addSavedViewCommentForTenant(user, id, body.body);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SAVED_VIEW_NOT_FOUND") {
      return NextResponse.json({ message: "Saved view not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "COMMENT_BODY_REQUIRED") return badRequest("Comment body is required");
    return serverError("Failed to add comment", error);
  }
}
