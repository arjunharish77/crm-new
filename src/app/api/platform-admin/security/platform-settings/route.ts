import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getPlatformSecuritySettings, updatePlatformSecuritySettings } from "@/lib/server/privileged-actions";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const settings = await getPlatformSecuritySettings();
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch platform security settings", error);
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePlatformAdmin(request);
    const body = await request.json().catch(() => null);
    if (typeof body?.privilegedActionApprovalRequired !== "boolean") {
      return badRequest("privilegedActionApprovalRequired (boolean) is required");
    }
    await updatePlatformSecuritySettings(admin, body.privilegedActionApprovalRequired);
    const settings = await getPlatformSecuritySettings();
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update platform security settings", error);
  }
}
