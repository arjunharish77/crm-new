import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listTaskSlaPoliciesForTenant, upsertTaskSlaPolicyForTenant } from "@/lib/repositories/task-sla-policies-postgres";

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const policies = await listTaskSlaPoliciesForTenant(user);
    return NextResponse.json(policies);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage SLA policies");
    return serverError("Failed to fetch task SLA policies", error);
  }
}

// One row per priority -- upsert-by-natural-key, so POST both creates and edits.
export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.priority || !VALID_PRIORITIES.includes(body.priority)) {
      return badRequest("A valid priority (LOW, MEDIUM, HIGH, URGENT) is required");
    }
    const policy = await upsertTaskSlaPolicyForTenant(user, body);
    return NextResponse.json(policy);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only tenant admins can manage SLA policies");
    return serverError("Failed to save task SLA policy", error);
  }
}
