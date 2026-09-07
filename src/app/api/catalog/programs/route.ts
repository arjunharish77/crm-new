import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { createCatalogEntityForTenant, listCatalogEntitiesForTenant, listProgramsForTenant } from "@/lib/repositories/catalog-postgres";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

// Priority Module 12's "product catalog" -- GET with no `parentId` uses the specific
// `listProgramsForTenant` (its own real caller: the Opportunity Types settings page's Program
// picker, item 3), joined with University name for a readable label, across every university.
// GET with a `parentId` (a specific university) instead uses this module's item 4 generic
// catalog CRUD read path, so the catalog management UI's "Programs under THIS university" list
// can use the exact same `?parentId=` contract every other catalog entity's list endpoint uses.
// POST also goes through the generic CRUD -- kept on this SAME static route (rather than the
// generic `/api/catalog/[entity]` dynamic route the other 9 catalog entities use) specifically
// to avoid a routing collision: "programs" would otherwise match both this static folder and
// the dynamic one, and Next.js always resolves the static route first, silently starving the
// dynamic dispatcher's own handlers for this one entity.
export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");
    if (parentId) {
      const items = await listCatalogEntitiesForTenant(user, "programs", parentId);
      return NextResponse.json(items);
    }
    const programs = await listProgramsForTenant(user);
    return NextResponse.json(programs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch programs", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => ({}));
    const created = await createCatalogEntityForTenant(user, "programs", body);
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "NAME_REQUIRED") return badRequest("Name is required");
    if (error instanceof Error && error.message === "PARENT_ID_REQUIRED") return badRequest("A university must be selected");
    if (error instanceof Error && error.message === "CATALOG_PARENT_NOT_FOUND") return badRequest("Selected university was not found for this workspace");
    return serverError("Failed to create program", error);
  }
}
