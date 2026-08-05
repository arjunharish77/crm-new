import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { bulkUpdateTasksForTenant, createTaskForTenant, listTasksForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const tasks = await listTasksForTenant(user, {
      status: searchParams.get("status"),
      priority: searchParams.get("priority"),
      ownerId: searchParams.get("ownerId"),
      leadId: searchParams.get("leadId"),
      opportunityId: searchParams.get("opportunityId"),
      activityId: searchParams.get("activityId"),
      due: searchParams.get("due") as any,
    });
    return NextResponse.json(tasks);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch tasks", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const task = await createTaskForTenant(user, body);
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TASK_TITLE_REQUIRED") return badRequest("Task title is required");
    return serverError("Failed to create task", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const result = await bulkUpdateTasksForTenant(user, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update tasks", error);
  }
}
