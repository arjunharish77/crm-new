import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getTelephonySettingsForTenant, saveTelephonySettingsForTenant } from "@/lib/server/crm";
import { forbidden, serverError, unauthorized, userMessage } from "@/lib/server/http";
import { plivoCallbackUrl } from "@/lib/server/plivo";

// Gated to admins: the config this returns includes the live webhook signing secret, which
// was previously readable/writable by any authenticated user (a real gap flagged in this
// module's audit pass) even though only a tenant admin should be able to see or rotate it.
function hasTelephonyAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

function publicTelephonySettings(settings: any, tenantId: string | null) {
  const { plivoAuthTokenEncrypted, plivoAuthToken, ...config } = settings?.config ?? {};
  let plivoCallbackUrls: { answer: string; hangup: string } | null = null;
  let plivoCallbackError: string | null = null;
  // These two go on the Plivo Application (inbound calls). Outbound calls send their own URLs.
  if (tenantId) {
    try {
      plivoCallbackUrls = {
        answer: plivoCallbackUrl(tenantId, "answer"),
        hangup: plivoCallbackUrl(tenantId, "event", { source: "hangup" }),
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      plivoCallbackError = code === "PUBLIC_APP_URL_MISSING"
        ? "The CRM public URL is missing in the running web container. Check APP_DOMAIN in deploy/vps/.env and recreate web and worker."
        : code === "PUBLIC_APP_URL_HTTPS_REQUIRED"
          ? "The CRM public URL must use HTTPS. Check APP_DOMAIN in deploy/vps/.env."
          : "The CRM public URL is invalid. APP_DOMAIN must be a hostname without https:// or a path; recreate web and worker after changing it.";
    }
  }
  return { ...settings, config: { ...config, hasPlivoAuthToken: !!plivoAuthTokenEncrypted }, plivoCallbackUrls, plivoCallbackError };
}

const PLIVO_SETTING_ERRORS: Record<string, string> = {
  PLIVO_CREDENTIALS_MISSING: "Enter the Plivo Auth ID and Auth Token before turning Plivo on.",
  PLIVO_CALLER_ID_MISSING: "Enter your Plivo number (outbound caller ID or inbound number) before turning Plivo on.",
  PLIVO_DEFAULT_AGENT_MISSING: "Enter the default agent phone before turning Plivo on.",
  PLIVO_AGENT_NUMBER_CANNOT_BE_PLIVO_NUMBER: "The default agent phone must be a different number from your Plivo number, or calls would loop.",
  PLIVO_PHONE_INVALID: "A phone number isn't valid. Use a 10-digit Indian number or the full number with its country code, such as +919876543210.",
  PLIVO_COUNTRY_CODE_INVALID: "The default country code must be 1 to 3 digits, such as 91.",
  PLIVO_RING_TIMEOUT_INVALID: "Ring time must be a whole number of seconds from 10 to 120.",
};

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to view telephony settings");
    const settings = await getTelephonySettingsForTenant(user);
    return NextResponse.json(publicTelephonySettings(settings, user.tenantId));
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
    return NextResponse.json(publicTelephonySettings(settings, user.tenantId));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("PLIVO_")) return userMessage(PLIVO_SETTING_ERRORS[error.message] ?? error.message);
    return serverError("Failed to save telephony settings", error);
  }
}
