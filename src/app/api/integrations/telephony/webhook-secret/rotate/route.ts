import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { rotateTelephonyWebhookSecret } from "@/lib/server/telephony-webhook";

function hasTelephonyAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to manage telephony settings");
    const result = await rotateTelephonyWebhookSecret(user);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TELEPHONY_NOT_CONFIGURED") return badRequest("Configure telephony settings before rotating the webhook secret");
    return serverError("Failed to rotate telephony webhook secret", error);
  }
}
