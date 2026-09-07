import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getUserPreferencesForTenant, updateUserPreferencesForTenant } from "@/lib/repositories/user-preferences-postgres";
import { serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 10's "user workspace personalization" item -- unlike /api/settings/general
// (tenant-wide, admin-only), this is scoped to the CALLER's own preferences, so any authenticated
// user (including partners) can read/update their own -- no admin gate.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const preferences = await getUserPreferencesForTenant(user);
    return NextResponse.json(preferences);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch personalization settings", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const preferences = await updateUserPreferencesForTenant(user, body ?? {});
    return NextResponse.json(preferences);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update personalization settings", error);
  }
}
