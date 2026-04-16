import { NextResponse } from "next/server";
import { getLeadForTenant, updateLeadForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const lead = await getLeadForTenant(user, id);

    if (!lead) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch lead");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const payload = await request.json().catch(() => null);

    if (!payload?.name) {
      return badRequest("Lead name is required");
    }

    const lead = await updateLeadForTenant(user, id, payload);

    if (!lead) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update lead");
  }
}
