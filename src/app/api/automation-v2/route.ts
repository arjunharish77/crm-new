import { NextResponse } from "next/server";
import { createAutomationForTenant, listAutomationsForTenant } from "@/lib/server/crm";
import { badRequest, forbidden, serverError, unauthorized, userMessage } from "@/lib/server/http";
import { requireInternalUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    // ?archived=1: archived automations (restorable for 30 days).
    const automations = await listAutomationsForTenant(user, { archived: new URL(request.url).searchParams.get("archived") === "1" });
    return NextResponse.json(automations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch automations", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Automation name is required");
    const automation = await createAutomationForTenant(user, body);
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Automations is not enabled for this workspace");
    }
    if (error instanceof Error && error.message === "AUTOMATION_STEP_UNSUPPORTED") return userMessage("The workflow has a step this version of the CRM doesn't know. Remove it and save again.");
    return serverError("Failed to create automation", error);
  }
}
