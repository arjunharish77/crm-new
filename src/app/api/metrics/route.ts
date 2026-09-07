import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createMetricForTenant, listMetricsForTenant } from "@/lib/server/metrics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const metrics = await listMetricsForTenant(user);
    return NextResponse.json(metrics);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch metrics", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.name || !body?.root || !body?.aggregation) return badRequest("name, root, and aggregation are required");
    const metric = await createMetricForTenant(user, body);
    return NextResponse.json(metric);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && /REQUIRED|Unsupported/i.test(error.message)) return badRequest(error.message);
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to create metric", error);
  }
}
