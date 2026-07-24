import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listCommunicationProvidersForTenant, upsertCommunicationProviderForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listCommunicationProvidersForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch communication providers", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.channel || !body?.providerType || !body?.name) return badRequest("channel, providerType, and name are required");
    return NextResponse.json(await upsertCommunicationProviderForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save communication provider", error);
  }
}
