import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getOrCreateSyncConfig, updateSyncConfig } from "@/lib/server/marketplace-sync";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const config = await getOrCreateSyncConfig(user, id);
    return NextResponse.json(config);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load sync settings");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const config = await updateSyncConfig(user, id, body);
    return NextResponse.json(config);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update sync settings");
  }
}
