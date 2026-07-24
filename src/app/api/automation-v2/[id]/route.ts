import { NextResponse } from "next/server";
import {
  deleteAutomationForTenant,
  getAutomationForTenant,
  updateAutomationForTenant,
} from "@/lib/server/crm";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { requireInternalUser } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    const automation = await getAutomationForTenant(user, id);
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch automation", error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const body = await request.json().catch(() => null);
    const { id } = await params;
    const automation = await updateAutomationForTenant(user, id, body ?? {});
    return NextResponse.json(automation);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update automation", error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireInternalUser(request);
    const { id } = await params;
    await deleteAutomationForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to delete automation", error);
  }
}
