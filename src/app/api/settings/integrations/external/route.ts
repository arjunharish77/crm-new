import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { hasIntegrationsAccess } from "@/lib/server/integrations-access";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createExternalIntegrationForTenant, listExternalIntegrationsForTenant } from "@/lib/repositories/external-integrations-postgres";


export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to manage integrations");
    const integrations = await listExternalIntegrationsForTenant(user);
    return NextResponse.json(integrations);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch integrations", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to manage integrations");
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.endpointUrl) return badRequest("Integration name and endpoint URL are required");
    const integration = await createExternalIntegrationForTenant(user, body);
    return NextResponse.json(integration);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DUPLICATE_INTEGRATION_NAME") {
      return badRequest("An integration with this name already exists");
    }
    return serverError("Failed to create integration", error);
  }
}
