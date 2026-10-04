import { NextResponse } from "next/server";
import { getPartnerInvoiceDownloadByToken } from "@/lib/server/partner-invoices";
import { badRequest, safeContentDispositionFilename, serverError } from "@/lib/server/http";

// Public, token-verified -- no session required. Reached from a link minted by
// POST /api/partner-invoices/[id]/signed-url, not a session-authenticated route; see that
// file's comment for why this is additive rather than a replacement for the existing
// authenticated inline-view route.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = new URL(request.url).searchParams.get("token");
    const file = await getPartnerInvoiceDownloadByToken(id, token);
    return new NextResponse(new Uint8Array(file.file), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${safeContentDispositionFilename(file.filename, "invoice.pdf")}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") return badRequest("Invoice not found");
    if (error instanceof Error && error.message.startsWith("INVALID_TOKEN:")) {
      const reason = error.message.split(":")[1];
      if (reason === "EXPIRED") return badRequest("This download link has expired");
      return badRequest("This download link is invalid");
    }
    return serverError("Failed to download invoice", error);
  }
}
