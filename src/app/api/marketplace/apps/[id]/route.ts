import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateMarketplaceApp } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const app = await updateMarketplaceApp(user, id, body);
    return NextResponse.json(app);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update marketplace app");
  }
}
