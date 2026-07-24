import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getPartnerInvoiceTemplate, upsertPartnerInvoiceTemplate } from "@/lib/server/partner-invoices";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const template = await getPartnerInvoiceTemplate(user, id);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch invoice template", error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const template = await upsertPartnerInvoiceTemplate(user, id, body);
    return NextResponse.json(template);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save invoice template", error);
  }
}
