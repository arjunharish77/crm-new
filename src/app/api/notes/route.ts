import { NextResponse } from "next/server";
import { createNoteForTenant, listNotesForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");

    if (!entityType || !entityId) {
      return badRequest("entityType and entityId are required");
    }

    const notes = await listNotesForTenant(user, entityType, entityId);
    return NextResponse.json(notes);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch notes");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);

    if (!body?.entityType || !body?.entityId || !body?.content?.trim()) {
      return badRequest("entityType, entityId, and content are required");
    }

    const note = await createNoteForTenant(user, body.entityType, body.entityId, body.content.trim());
    return NextResponse.json(note);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to create note");
  }
}
