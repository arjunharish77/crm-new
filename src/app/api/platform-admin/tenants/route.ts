import { NextResponse } from "next/server";
import { createTenantWithAdmin, listTenants } from "@/lib/server/admin";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const tenants = await listTenants();
    return NextResponse.json(tenants);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch tenants");
  }
}

export async function POST(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.adminName || !body?.adminEmail || !body?.adminPassword) {
      return badRequest("Tenant and admin details are required");
    }

    const created = await createTenantWithAdmin(body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to create tenant");
  }
}
