import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { getInboundWebhookSettingsForTenant } from "@/lib/server/inbound-webhooks";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const settings = await getInboundWebhookSettingsForTenant(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch inbound webhook settings", error);
  }
}
