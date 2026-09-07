import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { getRecommendationById, respondToRecommendation } from "@/lib/server/next-best-action";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body?.status) return badRequest("status is required");

    const recommendation = await getRecommendationById(user, id);
    if (!recommendation) return NextResponse.json({ message: "Recommendation not found" }, { status: 404 });

    // Rides on the parent record's own permission, same as the list route -- a rep
    // can only respond to a recommendation on a record they can actually see.
    const record =
      recommendation.recordType === "LEAD"
        ? await getLeadForTenant(user, recommendation.recordId)
        : await getOpportunityForTenant(user, recommendation.recordId);
    if (!record) return forbidden("Record not found or not visible to this user");

    const updated = await respondToRecommendation(user, id, { status: body.status, snoozedUntil: body.snoozedUntil });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NBA_RECOMMENDATION_ALREADY_RESOLVED") {
      return badRequest("This recommendation has already been responded to");
    }
    if (error instanceof Error && error.message.startsWith("NBA_")) {
      return badRequest(error.message);
    }
    return serverError("Failed to respond to Next-Best-Action recommendation", error);
  }
}
