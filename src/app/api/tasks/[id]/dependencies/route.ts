import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { setTaskDependenciesForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.blockedByTaskIds)) return badRequest("Provide a blockedByTaskIds array");
    const task = await setTaskDependenciesForTenant(user, id, body.blockedByTaskIds);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return badRequest("Task not found");
    if (error instanceof Error && error.message === "TASK_DEPENDENCY_CYCLE") return badRequest("That would create a circular dependency between these two tasks");
    return serverError("Failed to update task dependencies", error);
  }
}
