import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import {
  AiProviderError,
  explainPredictiveScore,
  explainTimeline,
  prepareCallNotes,
  prepareManagerReview,
  suggestNextTask,
  summarizeRecord,
} from "@/lib/server/ai-assistant";

const ACTIONS: Record<string, (user: any, entityType: string, entityId: string) => Promise<{ text: string }>> = {
  summarize_record: summarizeRecord,
  explain_timeline: explainTimeline,
  prepare_call_notes: prepareCallNotes,
  suggest_next_task: suggestNextTask,
  explain_predictive_score: explainPredictiveScore,
  prepare_manager_review: prepareManagerReview,
};

// Single dispatcher for the AI assistant's record-scoped command-palette actions (checklist
// item 4) -- any authenticated internal user with view access to the record can run these
// (server-side, buildRecordContextPack already scopes to the record's own tenant); the
// AI_COPILOT module gate and tenant AI settings are enforced inside ai-assistant.ts itself.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const action = ACTIONS[String(body?.action ?? "")];
    if (!action || !body?.entityType || !body?.entityId) return badRequest("A valid action, entityType, and entityId are required");

    const result = await action(user, String(body.entityType), String(body.entityId));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    if (error instanceof AiProviderError) return badRequest(error.message);
    return serverError("AI assistant action failed", error);
  }
}
