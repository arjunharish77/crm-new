import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getAiProviderSettingsForTenant, upsertAiProviderSettingsForTenant } from "@/lib/server/ai-assistant";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    return NextResponse.json(await getAiProviderSettingsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    return serverError("Failed to fetch AI settings", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await upsertAiProviderSettingsForTenant(user, body ?? {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message.startsWith("MODULE_DISABLED")) return forbidden("AI Copilot module is disabled for this tenant");
    return serverError("Failed to update AI settings", error);
  }
}
