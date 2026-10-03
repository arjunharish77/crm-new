import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { reorderStages } from "@/lib/repositories/stages-postgres";
import { stageErrorResponse } from "@/lib/server/stage-errors";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body?.ids)) return badRequest("ids must be a list of stage ids");
    return NextResponse.json(await reorderStages(user, id, body.ids.map(String)));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Opportunities aren't turned on for this workspace");
    return stageErrorResponse(error) ?? serverError("Failed to reorder the stages", error);
  }
}
