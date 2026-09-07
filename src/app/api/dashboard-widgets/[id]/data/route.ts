import { NextResponse } from "next/server";
import { DashboardCrossFilter, getDashboardWidgetDataForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const filterModule = searchParams.get("filterModule");
    const filterField = searchParams.get("filterField");
    const filterValue = searchParams.get("filterValue");
    const crossFilter: DashboardCrossFilter = filterModule === "LEADS" || filterModule === "OPPORTUNITIES"
      ? (filterField && filterValue !== null ? { module: filterModule, field: filterField, value: filterValue } : null)
      : null;
    const data = await getDashboardWidgetDataForTenant(user, id, crossFilter);
    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch widget data", error);
  }
}
