import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listMarketingSnippetsForTenant, upsertMarketingSnippetForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await listMarketingSnippetsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch marketing snippets", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => null);
    if (!body?.key || !body?.body) return badRequest("key and body are required");
    return NextResponse.json(await upsertMarketingSnippetForTenant(user, body));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to save marketing snippet", error);
  }
}
