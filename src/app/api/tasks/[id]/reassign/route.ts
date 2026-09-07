import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { reassignQueueTaskForTenant } from "@/lib/server/tasks";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

// Supervisor-only: hands a specific queued task to a specific teammate. Plain claim/unclaim
// only ever act on the caller's own behalf; this is the deliberate override for a team lead
// or TEAM/ALL-scoped user.
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.targetUserId) return badRequest("targetUserId is required");
    const task = await reassignQueueTaskForTenant(user, id, body.targetUserId);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only a supervisor for this queue can reassign its tasks");
    if (error instanceof Error && error.message === "TARGET_NOT_QUEUE_MEMBER") return badRequest("That user isn't a member of this queue's team");
    return serverError("Failed to reassign task", error);
  }
}
