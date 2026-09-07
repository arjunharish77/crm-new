import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { AiProviderError, generateNlReportDefinition } from "@/lib/server/ai-assistant";

// Never auto-saves -- returns the generated ReportQueryDefinition plus a live preview, so the
// caller can review and separately confirm before running/saving as a real report/view
// (checklist item 7).
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.prompt) return badRequest("prompt is required");
    return NextResponse.json(await generateNlReportDefinition(user, String(body.prompt)));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    if (error instanceof AiProviderError) return badRequest(error.message);
    return serverError("Failed to generate report from prompt", error);
  }
}
