import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { queryOne } from "@/lib/db/query";
import { generatePartnerInvoiceForPayout } from "@/lib/server/partner-invoices";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;

    // Either the partner who owns this payout, or a tenant admin on their behalf.
    if (!user.isTenantAdmin && !user.isPlatformAdmin) {
      const payout = await queryOne<{ partnerId: string | null }>(
        `select "partnerId" from "Payout" where id = $1 and "tenantId" = $2`,
        [id, user.tenantId],
      );
      if (!payout || payout.partnerId !== user.id) {
        return forbidden("You can only generate an invoice for your own payout");
      }
    }

    const invoice = await generatePartnerInvoiceForPayout(user, id);

    if (!invoice) {
      return NextResponse.json({ message: "Payout not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "PAYOUT_NOT_APPROVED") {
      return badRequest("Payout must be Approved before generating an invoice");
    }
    if (error instanceof Error && error.message === "COMPANY_GST_DETAILS_NOT_CONFIGURED") {
      return badRequest("Configure your company GST details in Payout Settings before generating invoices");
    }
    if (error instanceof Error && error.message === "PARTNER_SELF_INVOICE_DISABLED") {
      return badRequest("Partner self-invoicing is disabled for this tenant");
    }
    return serverError("Failed to generate invoice", error);
  }
}
