import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getGamificationSettingsForTenant } from "@/lib/server/gamification";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const settings = await getGamificationSettingsForTenant(user);
    const rewards = Array.isArray(settings?.redemptionCatalog)
      ? settings.redemptionCatalog.filter((reward: any) => reward?.isActive !== false)
      : [];
    return NextResponse.json(rewards);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch rewards", error);
  }
}
