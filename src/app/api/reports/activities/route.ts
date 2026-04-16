import { NextResponse } from "next/server";
import { getActivitiesReportForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const report = await getActivitiesReportForTenant(user);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch activities report");
  }
}
