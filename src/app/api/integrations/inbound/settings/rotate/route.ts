import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";
import { rotateInboundWebhookSecret } from "@/lib/server/inbound-webhooks";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const settings = await rotateInboundWebhookSecret(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to rotate inbound webhook secret", error);
  }
}
