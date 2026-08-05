import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listSenderIdentitiesForTenant, upsertSenderIdentityForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listSenderIdentitiesForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch sender identities", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.channel || !body?.name || !body?.address) return badRequest("channel, name, and address are required");
    return NextResponse.json(await upsertSenderIdentityForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save sender identity", error);
  }
}
