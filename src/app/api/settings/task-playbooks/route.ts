import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createTaskPlaybookForTenant, listTaskPlaybooksForTenant } from "@/lib/repositories/task-playbooks-postgres";

// Listing is open to any authenticated internal user -- both the automation builder's
// "Apply Task Playbook" node config and the manual apply picker on Lead/Opportunity detail
// pages need to read the list. Only creating/editing/deleting playbooks is admin-gated.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const url = new URL(request.url);
    const targetModule = url.searchParams.get("targetModule");
    const activeOnly = url.searchParams.get("activeOnly") === "true";
    const playbooks = await listTaskPlaybooksForTenant(user, { targetModule, activeOnly });
    return NextResponse.json(playbooks);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch task playbooks", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !Array.isArray(body?.items) || body.items.length === 0) {
      return badRequest("Playbook name and at least one task item are required");
    }
    const playbook = await createTaskPlaybookForTenant(user, body);
    return NextResponse.json(playbook);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage task playbooks");
    return serverError("Failed to create task playbook", error);
  }
}
