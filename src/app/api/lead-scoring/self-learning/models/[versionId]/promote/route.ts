import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { promoteScoringModelVersion } from "@/lib/server/self-learning-scoring";

export async function POST(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { versionId } = await params;
    if (!versionId) return badRequest("versionId is required");
    const result = await promoteScoringModelVersion(user, versionId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "SCORING_MODEL_VERSION_NOT_FOUND") return badRequest("Model version not found");
    if (error instanceof Error && error.message === "SCORING_MODEL_NOT_FOUND") return badRequest("Model not found");
    return serverError("Failed to promote scoring model version", error);
  }
}
