import { NextResponse } from "next/server";
import { cloneSavedViewForTenant, deleteSavedViewForTenant, updateSavedViewForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const view = await updateSavedViewForTenant(user, id, body);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "SAVED_VIEW_NOT_FOUND") {
      return NextResponse.json({ message: "Saved view not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden("Only this View's owner or a tenant admin can edit it");
    }
    if (error instanceof Error && error.message === "OWNER_NOT_FOUND") {
      return badRequest("That user isn't part of this tenant");
    }

    return serverError("Failed to update saved view", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    if (searchParams.get("action") !== "clone") {
      return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
    }
    const view = await cloneSavedViewForTenant(user, id);
    return NextResponse.json(view);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to clone saved view", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const archived = await deleteSavedViewForTenant(user, id);
    return NextResponse.json({ success: true, purgeAfter: archived?.purgeAfter ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return forbidden("Only this View's owner or a tenant admin can delete it");
    }

    return serverError("Failed to delete saved view", error);
  }
}
