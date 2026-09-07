import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createAiPromptTemplateVersion, listAiPromptTemplatesForTenant } from "@/lib/server/ai-assistant";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    return NextResponse.json(await listAiPromptTemplatesForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    return serverError("Failed to fetch AI prompt templates", error);
  }
}

// Creates a new version -- editing a template never overwrites history (checklist item 3's
// "versioning" requirement).
export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.key || !body?.template) return badRequest("key and template are required");
    return NextResponse.json(await createAiPromptTemplateVersion(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    return serverError("Failed to create AI prompt template version", error);
  }
}
