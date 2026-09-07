import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createCalculatedMetricForTenant, listCalculatedMetricsForTenant } from "@/lib/server/calculated-metrics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const metrics = await listCalculatedMetricsForTenant(user);
    return NextResponse.json(metrics);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch calculated metrics", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.name || !Array.isArray(body?.steps)) return badRequest("name and steps are required");
    const metric = await createCalculatedMetricForTenant(user, body);
    return NextResponse.json(metric);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && /REQUIRED|Unsupported|not found|not visible|group-by|at least 2 steps|first step/i.test(error.message)) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to create calculated metric", error);
  }
}
