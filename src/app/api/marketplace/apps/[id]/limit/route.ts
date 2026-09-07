import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateAppDeliveryLimit } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const limit = body?.dailyDeliveryLimit === null || body?.dailyDeliveryLimit === undefined ? null : Number(body.dailyDeliveryLimit);
    const result = await updateAppDeliveryLimit(user, id, limit);
    return NextResponse.json(result);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update delivery limit");
  }
}
