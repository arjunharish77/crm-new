import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import {
  getOpportunityForTenant,
  deleteOpportunityForTenant,
  updateOpportunityForTenant,
} from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
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

    return serverError("Failed to fetch opportunity", error);
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
    if (!opportunity) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(opportunity);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Opportunities is not enabled for this workspace");
    }

    return serverError("Failed to update opportunity", error);
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
    if (error instanceof Error && error.message === "OPPORTUNITY_NOT_FOUND") {
      return NextResponse.json({ message: "Opportunity not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) {
      return badRequest("Opportunities is not enabled for this workspace");
    }
    // Tasks, notes and commission entries keep their opportunity, so it can't be deleted while
    // they point at it (was a 500).
    if ((error as { code?: string })?.code === "23503") {
      return NextResponse.json({ message: "This opportunity is still linked to tasks, notes or commission entries, so it can't be deleted." }, { status: 409 });
    }

    return serverError("Failed to delete opportunity", error);
  }
}
