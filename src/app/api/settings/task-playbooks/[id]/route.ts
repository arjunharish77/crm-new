import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import {
  deleteTaskPlaybookForTenant,
  getTaskPlaybookForTenant,
  updateTaskPlaybookForTenant,
} from "@/lib/repositories/task-playbooks-postgres";

type Params = {
  params: Promise<{ id: string }>;
};

function notFound(message = "Not found") {
  return NextResponse.json({ message }, { status: 404 });
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const playbook = await getTaskPlaybookForTenant(user, id);
    if (!playbook) return notFound("Playbook not found");
    return NextResponse.json(playbook);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch task playbook", error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Invalid request body");
    const updated = await updateTaskPlaybookForTenant(user, id, body);
    if (!updated) return notFound("Playbook not found");
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage task playbooks");
    return serverError("Failed to update task playbook", error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const deleted = await deleteTaskPlaybookForTenant(user, id);
    if (!deleted) return notFound("Playbook not found");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage task playbooks");
    return serverError("Failed to delete task playbook", error);
  }
}
