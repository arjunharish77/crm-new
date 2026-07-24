import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listGamificationRedemptionsForTenant } from "@/lib/server/gamification";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const redemptions = await listGamificationRedemptionsForTenant(user);
    return NextResponse.json(redemptions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch gamification redemptions", error);
  }
}
