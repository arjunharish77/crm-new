import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { rollbackAppToVersion } from "@/lib/server/marketplace";
import { badRequest, marketplaceErrorResponse } from "@/lib/server/http";

// Gap checklist Module 16's app dependency and compatibility checks, "safe upgrade path"/
// "rollback plan" sub-items -- restores an old approved version's config onto the live app row,
// republishing it as a new version at the tip (a git-revert, not a git-reset).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const targetVersion = Number(body?.version);
    if (!Number.isFinite(targetVersion) || targetVersion < 1) return badRequest("A valid version number is required");
    const app = await rollbackAppToVersion(user, id, targetVersion);
    return NextResponse.json(app);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to roll back app");
  }
}
