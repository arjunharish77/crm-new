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

    return serverError("Failed to fetch lead", error);
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

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return badRequest("Invalid lead update");
    }
    // A partial update only changes the fields it sends (UI/UX plan B14: "Assign to me" used to
    // resend the whole lead snapshot just to satisfy this check, overwriting newer edits). The
    // name, when sent, still can't be blank.
    if ("name" in payload && !String(payload.name ?? "").trim()) {
      return badRequest("Lead name is required");
    }

    const lead = await updateLeadForTenant(user, id, payload);

    if (!lead) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof Error && error.message === "LEAD_STATUS_UNKNOWN") {
      return badRequest("Unknown lead status. Use one of the workspace's lead statuses (key or label).");
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to update lead", error);
  }
}
