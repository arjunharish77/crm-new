import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { cancelAndReissuePartnerInvoice } from "@/lib/server/partner-invoices";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const result = await cancelAndReissuePartnerInvoice(user, id, body?.reason);
    if (!result) {
      return NextResponse.json({ message: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return unauthorized("Only a tenant admin can reissue an invoice");
    if (error instanceof Error && error.message === "CANCELLATION_REASON_REQUIRED") {
      return badRequest("A reason is required to cancel and reissue an invoice");
    }
    if (error instanceof Error && error.message === "INVOICE_ALREADY_CANCELLED") {
      return badRequest("This invoice has already been cancelled");
    }
    return serverError("Failed to reissue invoice", error);
  }
}
