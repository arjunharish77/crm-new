import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { createReportScheduleForTenant, listReportSchedulesForTenant } from "@/lib/server/report-schedules";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const schedules = await listReportSchedulesForTenant(user);
    return NextResponse.json(schedules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch report schedules", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.reportKey) return badRequest("reportKey is required");
    const schedule = await createReportScheduleForTenant(user, body);
    return NextResponse.json(schedule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "RECIPIENTS_REQUIRED") return badRequest("At least one recipient is required");
    return serverError("Failed to create report schedule", error);
  }
}
