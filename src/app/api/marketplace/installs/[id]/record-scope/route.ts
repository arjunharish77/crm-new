import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getAppRecordScopeForInstall, updateAppRecordScopeForInstall } from "@/lib/server/marketplace";
import { badRequest, marketplaceErrorResponse } from "@/lib/server/http";

// WP04 fix: lets a tenant admin additionally constrain a marketplace app install to OWN/TEAM
// record-scope and per-field masking, on top of its existing module-level read/write grants
// (see the sibling `permissions` route). See marketplace-inbound.ts's buildAppScopedActor for
// where this actually gets enforced on every /api/v1/apps/* request.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const scope = await getAppRecordScopeForInstall(user, id);
    return NextResponse.json(scope);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load record-scope settings");
  }
}

const VALID_RECORD_ACCESS = new Set(["OWN", "TEAM", "ALL"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const recordAccess = typeof body.recordAccess === "string" ? body.recordAccess : "ALL";
    if (!VALID_RECORD_ACCESS.has(recordAccess)) return badRequest("recordAccess must be one of OWN, TEAM, ALL");
    const ownerUserId = typeof body.ownerUserId === "string" && body.ownerUserId.trim() ? body.ownerUserId : null;
    const fieldPermissions =
      body.fieldPermissions && typeof body.fieldPermissions === "object" && !Array.isArray(body.fieldPermissions) ? body.fieldPermissions : null;
    const updated = await updateAppRecordScopeForInstall(user, id, { recordAccess: recordAccess as "OWN" | "TEAM" | "ALL", ownerUserId, fieldPermissions });
    return NextResponse.json(updated);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update record-scope settings");
  }
}
