import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getPartnerPayoutSettingsForTenant, upsertPartnerPayoutSettingsForTenant } from "@/lib/server/payouts";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const settings = await getPartnerPayoutSettingsForTenant(user);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch payout settings", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.cycleFrequency) {
      return badRequest("cycleFrequency is required");
    }

    const settings = await upsertPartnerPayoutSettingsForTenant(user, body);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save payout settings", error);
  }
}
