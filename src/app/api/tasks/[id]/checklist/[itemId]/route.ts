import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { toggleTaskChecklistItemForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id, itemId } = await params;
    const body = await request.json().catch(() => null);
    if (typeof body?.isDone !== "boolean") return badRequest("Provide isDone as a boolean");
    const task = await toggleTaskChecklistItemForTenant(user, id, itemId, body.isDone);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CHECKLIST_ITEM_NOT_FOUND") return badRequest("Checklist item not found");
    return serverError("Failed to update checklist item", error);
  }
}
