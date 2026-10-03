import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { removeStage, updateStage } from "@/lib/repositories/stages-postgres";
import { stageErrorResponse } from "@/lib/server/stage-errors";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { id, stageId } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateStage(user, id, stageId, body ?? {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Opportunities aren't turned on for this workspace");
    return stageErrorResponse(error) ?? serverError("Failed to update the stage", error);
  }
}

// Removing a stage: { moveToStageId } is required when opportunities are in it (decision 34).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { id, stageId } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await removeStage(user, id, stageId, body?.moveToStageId ?? null));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Opportunities aren't turned on for this workspace");
    return stageErrorResponse(error) ?? serverError("Failed to remove the stage", error);
  }
}
