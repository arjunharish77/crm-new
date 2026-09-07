import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { replaceTaskChecklistForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items)) return badRequest("Provide an items array");
    const task = await replaceTaskChecklistForTenant(user, id, body.items);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return badRequest("Task not found");
    return serverError("Failed to update checklist", error);
  }
}
