import { NextResponse } from "next/server";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";
import { testAutomationForTenant } from "@/lib/server/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const { id } = await params;
    if (!body?.entityType || !body?.entityId) {
      return badRequest("entityType and entityId are required");
    }
    const result = await testAutomationForTenant(user, id, body);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to test automation");
  }
}
