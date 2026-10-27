import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getFormDropOffReportForTenant } from "@/lib/server/inbuilt-reports";
import { parseReportFilters } from "@/lib/server/report-scope";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const report = await getFormDropOffReportForTenant(user, parseReportFilters(new URL(request.url).searchParams, user.id));
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch form drop-off report", error);
  }
}
