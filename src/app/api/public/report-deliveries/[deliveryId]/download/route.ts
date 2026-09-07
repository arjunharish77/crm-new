import { NextResponse } from "next/server";
import { getReportDeliveryDownload } from "@/lib/repositories/report-schedules-postgres";
import { badRequest, safeContentDispositionFilename, serverError } from "@/lib/server/http";

// Public, unauthenticated by design -- reached from a scheduled-report delivery email,
// identified by the ReportEmailDelivery row id rather than a separate token system (that row
// id already uniquely and non-guessably identifies one specific delivery, matching the same
// pattern as src/app/api/public/unsubscribe/[outboxId]/route.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const { deliveryId } = await params;
    const file = await getReportDeliveryDownload(deliveryId);
    return new NextResponse(file.buffer, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${safeContentDispositionFilename(file.filename)}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "REPORT_DELIVERY_NOT_FOUND") return badRequest("This download link was not found");
    if (error instanceof Error && error.message === "REPORT_DELIVERY_HAS_NO_FILE") return badRequest("This delivery doesn't have a downloadable file");
    if (error instanceof Error && error.message === "REPORT_DELIVERY_EXPIRED") return badRequest("This download link has expired -- ask for the report to be re-sent");
    if (error instanceof Error && error.message === "REPORT_DELIVERY_NOT_READY") return badRequest("This report isn't ready for download yet");
    return serverError("Failed to download report", error);
  }
}
