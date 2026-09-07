import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { approveRecommendation } from "@/lib/server/next-best-action";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const updated = await approveRecommendation(user, id);
    if (!updated) return NextResponse.json({ message: "Recommendation not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NBA_APPROVAL_NOT_AUTHORIZED") {
      return forbidden("You are not the manager for this recommendation's owner");
    }
    if (error instanceof Error && error.message === "NBA_RECOMMENDATION_ALREADY_RESOLVED") {
      return badRequest("This recommendation has already been approved or rejected");
    }
    if (error instanceof Error && error.message.startsWith("NBA_")) {
      return badRequest(error.message);
    }
    return serverError("Failed to approve Next-Best-Action recommendation", error);
  }
}
