import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { createExportTemplateForTenant, listExportTemplatesForTenant } from "@/lib/server/exports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const templates = await listExportTemplatesForTenant(user);
    return NextResponse.json(templates);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch export templates", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.moduleName) return badRequest("Template name and module are required");
    const template = await createExportTemplateForTenant(user, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DUPLICATE_EXPORT_TEMPLATE_NAME") {
      return badRequest("A template with this name already exists (archived templates count too: restore it, or delete it for good from Archived)");
    }
    return serverError("Failed to create export template", error);
  }
}
