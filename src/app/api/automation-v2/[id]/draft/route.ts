import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { discardAutomationDraftForTenant } from "@/lib/repositories/automations-postgres";
import { automationRouteError } from "@/lib/server/automation-route-errors";

// Discards unpublished changes (decision 29); what runs is unchanged.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    return NextResponse.json(await discardAutomationDraftForTenant(user, id));
  } catch (error) {
    return automationRouteError(error, "Failed to discard changes");
  }
}
