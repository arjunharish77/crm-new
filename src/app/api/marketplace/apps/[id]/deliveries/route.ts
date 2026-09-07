import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppDeliveriesForTenant } from "@/lib/server/marketplace-events";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const deliveries = await listAppDeliveriesForTenant(user, id);
    return NextResponse.json(deliveries);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app deliveries");
  }
}
