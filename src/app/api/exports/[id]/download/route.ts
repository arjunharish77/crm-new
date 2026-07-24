import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getExportDownloadForUser } from "@/lib/server/exports";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const file = await getExportDownloadForUser(user, id);
    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "EXPORT_NOT_READY") return badRequest("Export is not ready yet");
    if (error instanceof Error && error.message === "EXPORT_REQUEST_NOT_FOUND") return badRequest("Export request was not found");
    return serverError("Failed to download export", error);
  }
}
