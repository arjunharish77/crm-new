import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppActionsForTenant, createAppAction } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const actions = await listAppActionsForTenant(user, id);
    return NextResponse.json(actions);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app actions");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const action = await createAppAction(user, id, body);
    return NextResponse.json(action);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to create app action");
  }
}
