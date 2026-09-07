import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { sendTestAppEvent } from "@/lib/server/marketplace-diagnostics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await sendTestAppEvent(user, id, body?.eventType);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_FOUND") return badRequest("App not found");
    if (error instanceof Error && error.message === "APP_HAS_NO_WEBHOOK_URL") return badRequest("This app has no webhook URL configured");
    return serverError("Failed to send test event", error);
  }
}
