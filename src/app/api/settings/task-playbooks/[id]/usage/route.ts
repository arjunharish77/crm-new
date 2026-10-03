import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";
import { getTaskPlaybookUsageForTenant } from "@/lib/repositories/task-playbooks-postgres";

// Where a playbook has been used: counts and the latest applications (admins, like the rest of
// the playbook settings).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    return NextResponse.json(await getTaskPlaybookUsageForTenant(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PLAYBOOK_NOT_FOUND") return notFound("Playbook not found");
    return serverError("Failed to load playbook usage", error);
  }
}
