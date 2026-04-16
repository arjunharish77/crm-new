import { NextResponse } from "next/server";
import { createAutomationForTenant, listAutomationsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const automations = await listAutomationsForTenant(user);
    return NextResponse.json(automations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch automations");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Automation name is required");
    const automation = await createAutomationForTenant(user, body);
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create automation");
  }
}
