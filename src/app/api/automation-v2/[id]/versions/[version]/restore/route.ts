import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { restoreAutomationVersionAsDraftForTenant } from "@/lib/repositories/automations-postgres";
import { automationRouteError } from "@/lib/server/automation-route-errors";
import { badRequest } from "@/lib/server/http";

// Loads a published version into the draft; publishing it makes it live again (decision 29).
export async function POST(request: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id, version } = await params;
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1) return badRequest("Invalid version");
    return NextResponse.json(await restoreAutomationVersionAsDraftForTenant(user, id, number));
  } catch (error) {
    return automationRouteError(error, "Failed to restore version");
  }
}
