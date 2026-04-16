import { NextResponse } from "next/server";
import {
  getOpportunityForTenant,
  deleteOpportunityForTenant,
  updateOpportunityForTenant,
} from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const opportunity = await getOpportunityForTenant(user, id);

    if (!opportunity) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(opportunity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunity");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const payload = await request.json().catch(() => null);
    const { id } = await params;

    const opportunity = await updateOpportunityForTenant(user, id, payload ?? {});
    return NextResponse.json(opportunity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update opportunity");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(_request);
    const { id } = await params;
    await deleteOpportunityForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to delete opportunity");
  }
}
