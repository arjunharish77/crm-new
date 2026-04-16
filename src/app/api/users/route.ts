import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createTenantScopedUser, listTenantUsers } from "@/lib/server/admin";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const users = await listTenantUsers(user.tenantId);
    return NextResponse.json(users);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch users");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);

    if (!user.tenantId) {
      return forbidden("Tenant context required");
    }

    const body = await request.json().catch(() => null);
    if (!body?.name || !body?.email || !body?.password || !body?.roleId) {
      return badRequest("Name, email, password, and role are required");
    }

    const created = await createTenantScopedUser(user.tenantId, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create user");
  }
}
