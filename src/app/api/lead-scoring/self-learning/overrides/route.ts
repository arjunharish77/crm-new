import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { applyManualScoreOverride, clearManualScoreOverride } from "@/lib/server/self-learning-scoring";

function recordType(value: unknown) {
  return value === "LEAD" || value === "OPPORTUNITY" ? value : null;
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const type = recordType(body?.recordType);
    if (!body || !type || !body.recordId || !body.reason) {
      return badRequest("recordType, recordId, and reason are required");
    }
    const result = await applyManualScoreOverride(user, {
      recordType: type,
      recordId: String(body.recordId),
      scoreBand: body.scoreBand,
      conversionProbability: body.conversionProbability,
      winProbability: body.winProbability,
      stallRisk: body.stallRisk,
      reason: String(body.reason),
      expiresAt: body.expiresAt ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to apply score override", error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { searchParams } = new URL(request.url);
    const type = recordType(searchParams.get("recordType"));
    const recordId = searchParams.get("recordId");
    if (!type || !recordId) return badRequest("recordType and recordId are required");
    return NextResponse.json(await clearManualScoreOverride(user, {
      recordType: type,
      recordId,
      reason: searchParams.get("reason") ?? undefined,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to clear score override", error);
  }
}
