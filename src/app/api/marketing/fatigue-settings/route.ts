import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getFatigueSettingsForTenant, upsertFatigueSettingsForTenant } from "@/lib/server/communications";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await getFatigueSettingsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch contact fatigue settings", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await upsertFatigueSettingsForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save contact fatigue settings", error);
  }
}
