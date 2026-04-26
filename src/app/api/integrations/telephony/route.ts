import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getTelephonySettingsForTenant, saveTelephonySettingsForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
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
    const body = await request.json().catch(() => ({}));
    const settings = await saveTelephonySettingsForTenant(user, body ?? {});
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to save telephony settings", error);
  }
}
