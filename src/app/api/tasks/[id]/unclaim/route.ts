import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { unclaimTaskForTenant } from "@/lib/server/tasks";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const task = await unclaimTaskForTenant(user, id);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_NOT_FOUND") return NextResponse.json({ message: "Task not found" }, { status: 404 });
    if (error instanceof Error && error.message === "TASK_NOT_CLAIMED") return badRequest("This task isn't claimed by anyone");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only the person who claimed this task or a supervisor can unclaim it");
    return serverError("Failed to unclaim task", error);
  }
}
