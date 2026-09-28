import { NextResponse } from "next/server";
import { getPlatformAutomationStats } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// F23 fix (WP11): the same missing-route issue as usage/overview, for the automation-stats
// widget on the same page.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const stats = await getPlatformAutomationStats();
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch automation stats", error);
  }
}
