import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getSenderReputationReportForTenant } from "@/lib/server/inbuilt-reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(365, Number(searchParams.get("days") ?? 30)));
    const report = await getSenderReputationReportForTenant(user, days);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch sender reputation report", error);
  }
}
