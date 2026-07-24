import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createBadgeForTenant, listBadgesForTenant } from "@/lib/server/badges";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const badges = await listBadgesForTenant(user);
    return NextResponse.json(badges);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch badges", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.criteriaRules?.eventType || !body?.criteriaRules?.threshold) {
      return badRequest("name and criteriaRules.{eventType,threshold} are required");
    }

    const badge = await createBadgeForTenant(user, body);
    return NextResponse.json(badge);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create badge", error);
  }
}
