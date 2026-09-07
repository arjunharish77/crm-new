import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { claimTaskForTenant } from "@/lib/server/tasks";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const task = await claimTaskForTenant(user, id);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (error instanceof Error && error.message === "TASK_ALREADY_CLAIMED") return badRequest("This task has already been claimed");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only members of this task's queue team can claim it");
    return serverError("Failed to claim task", error);
  }
}
