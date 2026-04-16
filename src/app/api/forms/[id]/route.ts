import { NextResponse } from "next/server";
import { deleteFormForTenant, getFormForTenant, updateFormForTenant } from "@/lib/server/crm";
import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const form = await getFormForTenant(user, id);
    return NextResponse.json(form);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch form");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const form = await updateFormForTenant(user, id, body ?? {});
    return NextResponse.json(form);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update form");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    await deleteFormForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete form");
  }
}
