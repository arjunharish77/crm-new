import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";
import { createImportTemplateForTenant, listImportTemplatesForTenant } from "@/lib/server/crm";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const templates = await listImportTemplatesForTenant(user);
    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch import templates", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.module) return badRequest("Template name and module are required");
    const template = await createImportTemplateForTenant(user, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message === "DUPLICATE_IMPORT_TEMPLATE_NAME") {
      return badRequest("A template with this name already exists (archived templates count too: restore it, or delete it for good from Archived)");
    }
    return serverError("Failed to create import template", error);
  }
}
