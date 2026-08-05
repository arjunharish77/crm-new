import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listCommunicationSuppressionsForTenant, suppressCommunicationAddressForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listCommunicationSuppressionsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch communication suppressions", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.channel || !body?.address) return badRequest("channel and address are required");
    return NextResponse.json(await suppressCommunicationAddressForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to suppress communication address", error);
  }
}
