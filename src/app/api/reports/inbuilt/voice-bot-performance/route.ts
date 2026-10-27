import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { parseReportFilters } from "@/lib/server/report-scope";
import { requireVoiceBotAccess } from "@/lib/server/voice-bot-access";
import { voiceBotPerformanceReport } from "@/lib/server/voice-bot-stats";

// Voice Bot Performance (wave G): calls and results per bot for the chosen dates.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "advancedReporting", { isPlatformAdmin: user.isPlatformAdmin });
    await requireVoiceBotAccess(user as any, "view");
    return NextResponse.json(await voiceBotPerformanceReport(user, parseReportFilters(new URL(request.url).searchParams, user.id)));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message.startsWith("MODULE_DISABLED") || error.message.startsWith("FEATURE_DISABLED"))) {
      return forbidden("Voice bot reports need the Voice bots module and the View level for Voice bots.");
    }
    return serverError("Failed to fetch the voice bot performance report", error);
  }
}
