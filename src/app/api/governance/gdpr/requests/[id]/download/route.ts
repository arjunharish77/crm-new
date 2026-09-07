import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getPrivacyRequestDownload } from "@/lib/server/privacy";
import { badRequest, forbidden, safeContentDispositionFilename, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const file = await getPrivacyRequestDownload(user, id);
    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${safeContentDispositionFilename(file.filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "ACCOUNT_DEACTIVATED") return forbidden("This account has been deactivated");
    if (error instanceof Error && error.message === "TENANT_SUSPENDED") return forbidden("This workspace has been suspended");
    if (error instanceof Error && error.message === "PRIVACY_REQUEST_NOT_FOUND") return badRequest("Privacy request not found");
    if (error instanceof Error && error.message === "PRIVACY_REQUEST_HAS_NO_FILE") return badRequest("This request has no downloadable file");
    return serverError("Failed to download privacy request result", error);
  }
}
