import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateAppRateLimit } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await updateAppRateLimit(user, id, Number(body?.rateLimitPerMinute));
    return NextResponse.json(result);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update rate limit");
  }
}
