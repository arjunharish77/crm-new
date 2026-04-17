import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import {
  createCustomFieldForTenant,
  listCustomFieldsForTenant,
} from "@/lib/server/admin-modules";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { searchParams } = new URL(request.url);
    const objectType = searchParams.get("objectType");
    const fields = await listCustomFieldsForTenant(user, objectType);
    return NextResponse.json(fields);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch custom fields", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.label || !body?.key || !body?.objectType) return badRequest("Label, key, and object type are required");
    const created = await createCustomFieldForTenant(user, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create custom field", error);
  }
}
