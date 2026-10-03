import { NextResponse } from "next/server";
import {
  createActivityTypeForTenant,
  listActivityTypesForTenant,
} from "@/lib/server/crm";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized, forbidden } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const types = await listActivityTypesForTenant(user);
    return NextResponse.json(types);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return serverError("Failed to fetch activity types", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.name) {
      return badRequest("Name is required");
    }
    const created = await createActivityTypeForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden("Only admins can do this");

    return serverError("Failed to create activity type", error);
  }
}
