import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getPartnerInvoicePdfSignedUrl } from "@/lib/server/partner-invoices";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const result = await getPartnerInvoicePdfSignedUrl(user, id);

    if (!result) {
      return NextResponse.json({ message: "Invoice not found" }, { status: 404 });
    }

    if (!user.isTenantAdmin && !user.isPlatformAdmin && result.partnerId !== user.id) {
      return forbidden("You can only download your own invoices");
    }

    if ("file" in result && result.file) {
      const contentType = result.contentType || "application/pdf";
      return new NextResponse(new Uint8Array(result.file), {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="partner-invoice-${id}.pdf"`,
        },
      });
    }

    return NextResponse.json({ message: "Invoice file not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch invoice PDF", error);
  }
}
