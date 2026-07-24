import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createPartnerForTenant, listPartnerProfilesForTenant } from "@/lib/server/partners";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const partners = await listPartnerProfilesForTenant(user);
    return NextResponse.json(partners);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch partners", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.email || !body?.password || !body?.roleId || !body?.legalBusinessName) {
      return badRequest("name, email, password, roleId, and legalBusinessName are required");
    }

    const partner = await createPartnerForTenant(user, body);
    return NextResponse.json(partner);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "ROLE_IS_NOT_A_PARTNER_ROLE") {
      return badRequest("roleId must reference a role with isPartnerRole enabled");
    }
    return serverError("Failed to create partner", error);
  }
}
