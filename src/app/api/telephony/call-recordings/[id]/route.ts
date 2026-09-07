import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getCallRecordingForTenant } from "@/lib/server/call-recordings";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { id } = await params;
    const url = new URL(request.url);
    const action = url.searchParams.get("action") === "DOWNLOAD" ? "DOWNLOAD" : "PLAY";
    const recording = await getCallRecordingForTenant(user, id, action);
    return NextResponse.json(recording);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "CALL_LOG_NOT_FOUND") return badRequest("Call not found");
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You don't have permission to access this recording");
    if (error instanceof Error && error.message === "RECORDING_NOT_AVAILABLE") return badRequest("No recording is available for this call");
    if (error instanceof Error && error.message === "RECORDING_EXPIRED") return badRequest("This recording has expired and is no longer available");
    return serverError("Failed to fetch call recording", error);
  }
}
