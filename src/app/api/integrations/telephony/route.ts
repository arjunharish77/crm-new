import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getTelephonySettingsForTenant, saveTelephonySettingsForTenant } from "@/lib/server/crm";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gated to admins: the config this returns includes the live webhook signing secret, which
// was previously readable/writable by any authenticated user (a real gap flagged in this
// module's audit pass) even though only a tenant admin should be able to see or rotate it.
function hasTelephonyAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to view telephony settings");
    const settings = await getTelephonySettingsForTenant(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch telephony settings", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to manage telephony settings");
    const body = await request.json().catch(() => ({}));
    const settings = await saveTelephonySettingsForTenant(user, body ?? {});
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to save telephony settings", error);
  }
}
