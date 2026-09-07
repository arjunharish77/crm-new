import { NextResponse } from "next/server";
import { getExportDownloadByToken } from "@/lib/server/exports";
import { badRequest, safeContentDispositionFilename, serverError } from "@/lib/server/http";

// Public, token-verified -- no session required. Reached from a link minted by
// POST /api/exports/[id]/signed-url.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token");
    const file = await getExportDownloadByToken(id, token);
    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${safeContentDispositionFilename(file.filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EXPORT_NOT_READY") return badRequest("Export is not ready yet");
    if (error instanceof Error && error.message === "EXPORT_EXPIRED") return badRequest("This export file has expired and is no longer available");
    if (error instanceof Error && error.message === "EXPORT_REQUEST_NOT_FOUND") return badRequest("Export request was not found");
    if (error instanceof Error && error.message.startsWith("INVALID_TOKEN:")) {
      const reason = error.message.split(":")[1];
      if (reason === "EXPIRED") return badRequest("This download link has expired");
      return badRequest("This download link is invalid");
    }
    return serverError("Failed to download export", error);
  }
}
