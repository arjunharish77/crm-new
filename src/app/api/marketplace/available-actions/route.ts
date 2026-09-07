import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { listAvailableAppActionsForInstall } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const actions = await listAvailableAppActionsForInstall(user);
    return NextResponse.json(actions);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch available app actions");
  }
}
