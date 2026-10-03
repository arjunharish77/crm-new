import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { getAutomationForTenant, listAutomationVersionsForTenant } from "@/lib/repositories/automations-postgres";
import { automationRouteError } from "@/lib/server/automation-route-errors";

// Published versions of an automation, newest first (decision 29).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    if (!(await getAutomationForTenant(user, id))) throw new Error("AUTOMATION_NOT_FOUND");
    return NextResponse.json(await listAutomationVersionsForTenant(user, id));
  } catch (error) {
    return automationRouteError(error, "Failed to fetch versions");
  }
}
