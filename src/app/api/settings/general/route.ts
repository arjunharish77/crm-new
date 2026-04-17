import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  getGeneralSettingsForTenant,
  updateGeneralSettingsForTenant,
} from "@/lib/server/admin-modules";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const settings = await getGeneralSettingsForTenant(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch general settings", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const updated = await updateGeneralSettingsForTenant(user, body ?? {});
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update general settings", error);
  }
}
