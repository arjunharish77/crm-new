import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { applyTaskPlaybookForTenant } from "@/lib/repositories/task-playbooks-postgres";

type Params = {
  params: Promise<{ id: string }>;
};

// Same permission bar as creating a task manually (no dedicated permission module) --
// any authenticated internal user can apply a playbook to a record they can already see.
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || (!body.leadId && !body.opportunityId)) {
      return badRequest("Provide a leadId and/or opportunityId to apply the playbook to");
    }
    const result = await applyTaskPlaybookForTenant(user, id, {
      leadId: body.leadId ?? null,
      opportunityId: body.opportunityId ?? null,
      source: "MANUAL",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "PLAYBOOK_NOT_FOUND") return badRequest("Playbook not found");
    if (error instanceof Error && error.message === "PLAYBOOK_INACTIVE") return badRequest("This playbook is not active");
    if (error instanceof Error && error.message === "PLAYBOOK_HAS_NO_ITEMS") return badRequest("This playbook has no tasks configured");
    return serverError("Failed to apply task playbook", error);
  }
}
