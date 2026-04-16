import { NextResponse } from "next/server";
import { createDashboardWidgetForTenant, listDashboardWidgetsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const widgets = await listDashboardWidgetsForTenant(user);
    return NextResponse.json(widgets);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch dashboard widgets");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);

    if (!body?.title || !body?.type) {
      return badRequest("title and type are required");
    }

    const widget = await createDashboardWidgetForTenant(user, body);
    return NextResponse.json(widget);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to create dashboard widget");
  }
}
