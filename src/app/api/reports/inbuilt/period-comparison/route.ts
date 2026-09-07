import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { getPeriodComparisonReportForTenant, type PeriodComparisonPreset } from "@/lib/server/inbuilt-reports";

const PRESETS = ["THIS_MONTH_VS_LAST", "THIS_WEEK_VS_LAST", "THIS_QUARTER_VS_LAST"];

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const preset = (searchParams.get("preset") ?? "THIS_MONTH_VS_LAST").toUpperCase();
    if (!PRESETS.includes(preset)) return badRequest(`preset must be one of ${PRESETS.join(", ")}`);
    const report = await getPeriodComparisonReportForTenant(user, preset as PeriodComparisonPreset);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch period comparison report", error);
  }
}
