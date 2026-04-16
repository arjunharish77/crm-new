import { NextResponse } from "next/server";
import { deleteNoteForTenant, updateNoteForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const { id } = await params;

    if (!body?.content?.trim()) {
      return badRequest("content is required");
    }

    const note = await updateNoteForTenant(user, id, body.content.trim());
    return NextResponse.json(note);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update note");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteNoteForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete note");
  }
}
