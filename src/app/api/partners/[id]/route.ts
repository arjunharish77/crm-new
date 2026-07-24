import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { updatePartnerProfileForTenant } from "@/lib/server/partners";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => ({}));
    const { id } = await params;
    const updated = await updatePartnerProfileForTenant(user, id, body);

    if (!updated) {
      return NextResponse.json({ message: "Partner not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to update partner", error);
  }
}
