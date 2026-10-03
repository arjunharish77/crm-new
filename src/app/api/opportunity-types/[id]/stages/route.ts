import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { assertFeatureEnabled } from "@/lib/server/entitlements";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createStageForType, listStagesForType } from "@/lib/repositories/stages-postgres";
import { stageErrorResponse } from "@/lib/server/stage-errors";

// Settings › Opportunity types & stages (decision 34). Admin-only, with opportunity counts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { id } = await params;
    return NextResponse.json(await listStagesForType(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Opportunities aren't turned on for this workspace");
    return stageErrorResponse(error) ?? serverError("Failed to load stages", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    await assertFeatureEnabled(user.tenantId, "opportunityEnabled", { isPlatformAdmin: user.isPlatformAdmin });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await createStageForType(user, id, body ?? {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");
    if (error instanceof Error && error.message.startsWith("FEATURE_DISABLED")) return forbidden("Opportunities aren't turned on for this workspace");
    return stageErrorResponse(error) ?? serverError("Failed to add the stage", error);
  }
}
