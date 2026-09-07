import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  createCatalogEntityForTenant,
  isCatalogEntityKey,
  listCatalogEntitiesForTenant,
} from "@/lib/repositories/catalog-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

function notFoundResponse() {
  return NextResponse.json({ message: "Not found" }, { status: 404 });
}

// Priority Module 12's "product catalog" item 4, "admin catalog management UI" -- one generic
// CRUD dispatcher shared by 9 of the 10 named catalog entities (universities, campuses, courses,
// intakes, fee plans, scholarship rules, eligibility rules, application stages, application
// checklists). "programs" is deliberately NOT handled here -- see `catalog/programs/route.ts`'s
// own comment for why (a routing collision with its existing, more specific GET endpoint).
export async function GET(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { entity } = await params;
    if (!isCatalogEntityKey(entity)) return notFoundResponse();
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId") ?? undefined;
    const items = await listCatalogEntitiesForTenant(user, entity, parentId);
    return NextResponse.json(items);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "TENANT_CONTEXT_REQUIRED") return forbidden("Tenant context required");
    return serverError("Failed to fetch catalog entities", error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const { entity } = await params;
    if (!isCatalogEntityKey(entity)) return notFoundResponse();
    const body = await request.json().catch(() => ({}));
    const created = await createCatalogEntityForTenant(user, entity, body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    if (error instanceof Error && error.message === "PARENT_ID_REQUIRED") return badRequest("A parent record must be selected");
    if (error instanceof Error && error.message === "CATALOG_PARENT_NOT_FOUND") return badRequest("Selected parent record was not found for this workspace");
    return serverError("Failed to create catalog entity", error);
  }
}
