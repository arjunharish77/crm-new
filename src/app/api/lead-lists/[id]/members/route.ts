import { NextResponse } from "next/server";
import { addLeadsToLeadListForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const leadIds = Array.isArray(body?.leadIds) ? body.leadIds.filter((value: unknown): value is string => typeof value === "string") : [];
    if (leadIds.length === 0) return badRequest("leadIds are required");
    const list = await addLeadsToLeadListForTenant(user, id, leadIds);
    return NextResponse.json(list);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to add leads to list", error);
  }
}
