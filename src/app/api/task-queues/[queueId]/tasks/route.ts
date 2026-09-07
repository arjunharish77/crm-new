import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listQueueTasksForTenant } from "@/lib/server/tasks";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ queueId: string }>;
};

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { queueId } = await params;
    const tasks = await listQueueTasksForTenant(user, queueId);
    return NextResponse.json(tasks);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "QUEUE_NOT_FOUND") return NextResponse.json({ message: "Queue not found" }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only members of this queue's team (or a supervisor) can view it");
    return serverError("Failed to fetch queue tasks", error);
  }
}
