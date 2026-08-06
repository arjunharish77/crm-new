import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import {
  deleteExternalIntegrationForTenant,
  getExternalIntegrationForTenant,
  updateExternalIntegrationForTenant,
} from "@/lib/repositories/external-integrations-postgres";

type Params = {
  params: Promise<{ id: string }>;
};

function notFound(message = "Not found") {
  return NextResponse.json({ message }, { status: 404 });
}

function hasIntegrationsAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to manage integrations");
    const { id } = await params;
    const integration = await getExternalIntegrationForTenant(user, id);
    if (!integration) return notFound("Integration not found");
    return NextResponse.json(integration);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch integration", error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to manage integrations");
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) return badRequest("Invalid request body");
    const updated = await updateExternalIntegrationForTenant(user, id, body);
    if (!updated) return notFound("Integration not found");
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DUPLICATE_INTEGRATION_NAME") {
      return badRequest("An integration with this name already exists");
    }
    return serverError("Failed to update integration", error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasIntegrationsAccess(user)) return forbidden("You don't have permission to manage integrations");
    const { id } = await params;
    const deleted = await deleteExternalIntegrationForTenant(user, id);
    if (!deleted) return notFound("Integration not found");
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete integration", error);
  }
}
