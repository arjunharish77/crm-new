import { NextResponse } from "next/server";
import { getPlatformUsageOverview } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// F23 fix (WP11): /dashboard/admin/usage previously called this exact route and, finding it
// absent, silently displayed 0 for every figure -- indistinguishable from genuinely zero usage.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const overview = await getPlatformUsageOverview();
    return NextResponse.json(overview);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch usage overview", error);
  }
}
