import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { AiProviderError, draftCommunicationVariants } from "@/lib/server/ai-assistant";

// Generates draft variants only -- never sends. See /api/ai/draft-communication/confirm for the
// governed send step (checklist item 6: "edit before send, require human confirmation").
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.entityType || !body?.entityId || !body?.channel) return badRequest("entityType, entityId, and channel are required");

    const result = await draftCommunicationVariants(user, {
      entityType: String(body.entityType),
      entityId: String(body.entityId),
      channel: body.channel,
      instructions: body.instructions ? String(body.instructions) : undefined,
      variantCount: body.variantCount,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    if (error instanceof AiProviderError) return badRequest(error.message);
    return serverError("Failed to draft AI communication variants", error);
  }
}
