import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { listAppsWithAutomationTriggerGrant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

// The automation builder's "App Event" trigger app-picker -- every installed app allowed to
// fire POST /api/v1/apps/automation-events for this tenant.
export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const apps = await listAppsWithAutomationTriggerGrant(user);
    return NextResponse.json(apps);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch apps available for automation triggers");
  }
}
