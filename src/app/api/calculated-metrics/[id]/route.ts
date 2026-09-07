import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { deleteCalculatedMetricForTenant, getCalculatedMetricForTenant, updateCalculatedMetricForTenant } from "@/lib/server/calculated-metrics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const metric = await getCalculatedMetricForTenant(user, id);
    if (!metric) return NextResponse.json({ message: "Calculated metric not found" }, { status: 404 });
    return NextResponse.json(metric);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch calculated metric", error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const metric = await updateCalculatedMetricForTenant(user, id, body);
    return NextResponse.json(metric);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CALCULATED_METRIC_NOT_FOUND") return NextResponse.json({ message: "Calculated metric not found" }, { status: 404 });
    if (error instanceof Error && /REQUIRED|Unsupported|not found|not visible|group-by|at least 2 steps|first step/i.test(error.message)) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to update calculated metric", error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteCalculatedMetricForTenant(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Advanced Reporting is not enabled for this workspace");
    }
    return serverError("Failed to delete calculated metric", error);
  }
}
