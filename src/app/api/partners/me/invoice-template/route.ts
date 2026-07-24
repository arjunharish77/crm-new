import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getPartnerInvoiceTemplate, upsertPartnerInvoiceTemplate } from "@/lib/server/partner-invoices";
import { canCurrentUserAccessPayoutModule } from "@/lib/server/payouts";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPartner || !(await canCurrentUserAccessPayoutModule(user))) return forbidden("Payouts are not visible for this account");
    const template = await getPartnerInvoiceTemplate(user, user.id);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch invoice template", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.isPartner || !(await canCurrentUserAccessPayoutModule(user))) return forbidden("Payouts are not visible for this account");
    const body = await request.json().catch(() => ({}));
    const template = await upsertPartnerInvoiceTemplate(user, user.id, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to save invoice template", error);
  }
}
