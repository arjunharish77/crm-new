import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { previewExternalIntegrationPush, pushExternalIntegration } from "@/lib/repositories/external-integrations-postgres";

type Params = {
  params: Promise<{ id: string }>;
};

function hasIntegrationsAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to trigger integration pushes");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || (!body.leadId && !body.opportunityId)) {
      return badRequest("Provide a leadId and/or opportunityId to push");
    }
    const input = { leadId: body.leadId ?? null, opportunityId: body.opportunityId ?? null };
    const result = body.dryRun
      ? await previewExternalIntegrationPush(user, id, input)
      : await pushExternalIntegration(user, id, input);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "INTEGRATION_NOT_FOUND") return badRequest("Integration not found or inactive");
    if (error instanceof Error && error.message === "LEAD_NOT_FOUND") return badRequest("Lead not found for this tenant");
    if (error instanceof Error && error.message === "OPPORTUNITY_NOT_FOUND") return badRequest("Opportunity not found for this tenant");
    if (error instanceof Error && error.message === "INVALID_PAYLOAD_TEMPLATE") return badRequest("This integration's payload template is not valid JSON");
    return serverError("Failed to push to external integration", error);
  }
}
