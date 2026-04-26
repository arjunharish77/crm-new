import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  createPermissionTemplateForTenant,
  listPermissionTemplatesForTenant,
} from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const templates = await listPermissionTemplatesForTenant(user.tenantId);
    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch permission templates", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.permissions) return badRequest("Template name and permissions are required");
    const template = await createPermissionTemplateForTenant(user.tenantId, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create permission template", error);
  }
}
