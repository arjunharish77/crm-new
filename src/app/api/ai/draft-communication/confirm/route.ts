import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { confirmAndSendAiDraft } from "@/lib/server/ai-assistant";

// The human-confirmed send -- body/subject here are whatever the user actually edited to,
// never the raw AI variant automatically. Routes through a PrivilegedActionRequest instead of
// sending immediately when the tenant has opted into approval-required AI sends.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.entityId || !body?.channel || !body?.recipient || !body?.body) {
      return badRequest("entityType, entityId, channel, recipient, and body are required");
    }

    const outcome = await confirmAndSendAiDraft(user, {
      entityType: String(body.entityType),
      entityId: String(body.entityId),
      channel: body.channel,
      recipient: String(body.recipient),
      subject: body.subject ? String(body.subject) : undefined,
      body: String(body.body),
    });
    if (outcome && "pendingApproval" in outcome && outcome.pendingApproval) return NextResponse.json(outcome, { status: 202 });
    return NextResponse.json(outcome);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    return serverError("Failed to send AI-drafted communication", error);
  }
}
