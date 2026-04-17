import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  createOpportunityTypeConfigForTenant,
  listOpportunityTypeConfigsForTenant,
} from "@/lib/server/admin-modules";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const types = await listOpportunityTypeConfigsForTenant(user);
    return NextResponse.json(types);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch opportunity types", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Name is required");
    const created = await createOpportunityTypeConfigForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to create opportunity type", error);
  }
}
