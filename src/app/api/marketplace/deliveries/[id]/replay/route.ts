import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { replayAppDelivery } from "@/lib/server/marketplace-diagnostics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const result = await replayAppDelivery(user, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "APP_DELIVERY_NOT_FOUND") return badRequest("Delivery not found");
    return serverError("Failed to replay delivery", error);
  }
}
