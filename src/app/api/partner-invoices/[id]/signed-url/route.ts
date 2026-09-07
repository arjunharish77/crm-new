import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { mintPartnerInvoiceDownloadToken } from "@/lib/server/partner-invoices";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const { token, expiresAt } = await mintPartnerInvoiceDownloadToken(user, id);
    return NextResponse.json({ url: `/api/public/partner-invoices/${id}/download?token=${token}`, expiresAt });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("You can only share your own invoices");
    if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") return badRequest("Invoice not found");
    if (error instanceof Error && error.message === "TENANT_REQUIRED") return badRequest("A tenant context is required");
    return serverError("Failed to create a shareable invoice link", error);
  }
}
