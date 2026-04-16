import { NextResponse } from "next/server";
import { getDashboardWidgetDataForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const data = await getDashboardWidgetDataForTenant(user, id);
    return NextResponse.json(data ?? []);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch widget data");
  }
}
