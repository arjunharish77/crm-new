import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, moduleDependencyConflict, notFound, serverError, unauthorized } from "@/lib/server/http";
import { ModuleDependencyError } from "@/lib/server/module-entitlements";
import { resolveModuleAccessRequest } from "@/lib/server/module-access";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !["APPROVED", "DECLINED"].includes(body.decision)) return badRequest("decision must be APPROVED or DECLINED");
    if (body.status != null && !["ENABLED", "TRIAL"].includes(body.status)) return badRequest("status must be ENABLED or TRIAL");
    return NextResponse.json(await resolveModuleAccessRequest(user, id, { decision: body.decision, note: typeof body.note === "string" ? body.note : null, status: body.status ?? undefined, trialEndsAt: typeof body.trialEndsAt === "string" ? body.trialEndsAt : null }));
  } catch (error) {
    if (error instanceof ModuleDependencyError) return moduleDependencyConflict(error.explanation);
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MODULE_REQUEST_NOT_FOUND") return notFound("Request not found");
    if (error instanceof Error && error.message === "MODULE_REQUEST_ALREADY_RESOLVED") return moduleDependencyConflict("This request was already resolved.");
    if (error instanceof Error && error.message === "TRIAL_END_DATE_REQUIRED") return moduleDependencyConflict("Choose a trial end date in the future.", 400);
    return serverError("Failed to resolve module request", error);
  }
}
