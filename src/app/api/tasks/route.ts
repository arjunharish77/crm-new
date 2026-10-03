import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { bulkUpdateTasksForTenant, createTaskForTenant, listTasksForTenant, listTasksPageForTenant } from "@/lib/server/tasks";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");
    // Smart Views send grouped conditions (?filters=[...]) and ?strict=1.
    let groups: unknown = undefined;
    try {
      groups = searchParams.get("filters") ? JSON.parse(String(searchParams.get("filters"))) : undefined;
    } catch {
      return badRequest("Filters must be valid JSON");
    }
    const filters = {
      status: searchParams.get("status"),
      priority: searchParams.get("priority"),
      // "me" lets a saved link mean "whoever is signed in".
      ownerId: ownerId === "me" ? user.id : ownerId,
      leadId: searchParams.get("leadId"),
      opportunityId: searchParams.get("opportunityId"),
      activityId: searchParams.get("activityId"),
      due: searchParams.get("due") as any,
      open: searchParams.get("open") === "1",
      q: searchParams.get("q"),
      sort: searchParams.get("sort") ? { id: String(searchParams.get("sort")), desc: searchParams.get("dir") !== "asc" } : null,
      groups,
      strict: searchParams.get("strict") === "1",
    };
    // With ?page= the response is one page plus the total; without it, the plain array that
    // the record panels and other callers already use.
    if (searchParams.has("page")) {
      return NextResponse.json(await listTasksPageForTenant(user, filters, Number(searchParams.get("page")), Number(searchParams.get("limit") ?? 25)));
    }
    const tasks = await listTasksForTenant(user, filters);
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
