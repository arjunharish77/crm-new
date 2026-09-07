import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { addTaskToQueueForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

// Routes an existing task into a team queue, unclaimed -- distinct from claim/unclaim, which
// only toggle who currently holds a task that's already in a queue.
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.queueId) return badRequest("queueId is required");
    const task = await addTaskToQueueForTenant(user, id, body.queueId);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (error instanceof Error && error.message === "QUEUE_NOT_FOUND") return NextResponse.json({ message: "Queue not found" }, { status: 404 });
    return serverError("Failed to add task to queue", error);
  }
}
