import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { mintExportDownloadToken } from "@/lib/server/exports";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const { token, expiresAt } = await mintExportDownloadToken(user, id);
    return NextResponse.json({ url: `/api/public/exports/${id}/download?token=${token}`, expiresAt });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") return forbidden("This account has been deactivated");
    if (error instanceof Error && error.message === "TENANT_SUSPENDED") return forbidden("This workspace has been suspended");
    if (error instanceof Error && error.message === "EXPORT_NOT_READY") return badRequest("Export is not ready yet");
    if (error instanceof Error && error.message === "EXPORT_REQUEST_NOT_FOUND") return badRequest("Export request was not found");
    if (error instanceof Error && error.message === "TENANT_REQUIRED") return badRequest("A tenant context is required");
    return serverError("Failed to create a shareable export link", error);
  }
}
