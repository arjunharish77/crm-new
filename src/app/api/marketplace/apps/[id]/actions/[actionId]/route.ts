import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updateAppAction, deleteAppAction } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

type Params = { params: Promise<{ id: string; actionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id, actionId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = await updateAppAction(user, id, actionId, body);
    return NextResponse.json(action);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update app action");
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireTenantAdmin(request);
    const { id, actionId } = await params;
    await deleteAppAction(user, id, actionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to delete app action");
  }
}
