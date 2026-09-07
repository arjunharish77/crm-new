import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { autoBalanceQueueForTenant } from "@/lib/server/tasks";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ queueId: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { queueId } = await params;
    const result = await autoBalanceQueueForTenant(user, queueId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "QUEUE_NOT_FOUND") return NextResponse.json({ message: "Queue not found" }, { status: 404 });
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only a supervisor for this queue can auto-assign its backlog");
    return serverError("Failed to auto-assign queue tasks", error);
  }
}
