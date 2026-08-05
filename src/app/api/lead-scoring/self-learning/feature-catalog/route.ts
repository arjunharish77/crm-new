import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import {
  listFeatureCatalogForTenant,
  profileFeatureCatalogForTenant,
  updateFeatureCatalogForTenant,
} from "@/lib/server/self-learning-scoring";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const moduleParam = new URL(request.url).searchParams.get("targetModule");
    const targetModule = moduleParam === "LEAD" || moduleParam === "OPPORTUNITY" ? moduleParam : null;
    return NextResponse.json(await listFeatureCatalogForTenant(user, targetModule));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch scoring feature catalog", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items) return badRequest("items array is required");
    return NextResponse.json(await updateFeatureCatalogForTenant(user, items));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to update scoring feature catalog", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    return NextResponse.json(await profileFeatureCatalogForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to profile scoring feature catalog", error);
  }
}
