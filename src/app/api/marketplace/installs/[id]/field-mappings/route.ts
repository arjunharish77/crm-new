import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listFieldMappingsForInstall, setFieldMappings } from "@/lib/server/marketplace-sync";
import { badRequest, marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const mappings = await listFieldMappingsForInstall(user, id);
    return NextResponse.json(mappings);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load field mappings");
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (body?.module !== "leads" && body?.module !== "opportunities") return badRequest("module must be 'leads' or 'opportunities'");
    if (!Array.isArray(body?.mappings)) return badRequest("mappings must be an array");
    const mappings = await setFieldMappings(user, id, body.module, body.mappings);
    return NextResponse.json(mappings);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to save field mappings");
  }
}
