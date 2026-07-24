import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import {
  createPartnerLoginForTenant,
  listPartnerLoginsForOrganization,
  listPartnerProfilesForTenant,
} from "@/lib/server/partners";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const partners = await listPartnerProfilesForTenant(user);
    const profile = partners.find((partner: any) => partner.id === id);
    if (!profile) return NextResponse.json({ message: "Partner not found" }, { status: 404 });
    if (!profile.partnerOrganizationId) return NextResponse.json([profile]);
    const logins = await listPartnerLoginsForOrganization(user, profile.partnerOrganizationId);
    return NextResponse.json(logins);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch partner logins", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.email || !body?.password || !body?.roleId) {
      return badRequest("name, email, password, and roleId are required");
    }

    const { id } = await params;
    const login = await createPartnerLoginForTenant(user, id, body);
    if (!login) return NextResponse.json({ message: "Partner not found" }, { status: 404 });
    return NextResponse.json(login);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "ROLE_IS_NOT_A_PARTNER_ROLE") {
      return badRequest("roleId must reference a role with isPartnerRole enabled");
    }
    return serverError("Failed to create partner login", error);
  }
}
