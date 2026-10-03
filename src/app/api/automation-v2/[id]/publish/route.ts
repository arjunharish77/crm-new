import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { publishAutomationForTenant } from "@/lib/repositories/automations-postgres";
import { automationRouteError } from "@/lib/server/automation-route-errors";

// Publishes the draft as the next version: from now on it's what runs (decision 29).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const notes = typeof body?.notes === "string" ? body.notes.slice(0, 1000) : null;
    return NextResponse.json(await publishAutomationForTenant(user, id, notes));
  } catch (error) {
    return automationRouteError(error, "Failed to publish automation");
  }
}
