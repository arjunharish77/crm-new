import { NextResponse } from "next/server";
import { MarketplaceAppAuthenticationError, authenticateMarketplaceAppRequest, hasAppPermission } from "@/lib/server/marketplace-inbound";
import { getLeadOrOpportunityForConflictCheck, applyModuleUpdate, loadSyncContext, applyFieldMapping, resolveUpdateConflict } from "@/lib/server/marketplace-sync";
import { badRequest, forbidden, marketplaceAppAuthErrorResponse, serverError } from "@/lib/server/http";

// New: apps could previously only ever CREATE leads via the inbound API, never update one that
// already exists. That's the missing piece "sync direction: APP_TO_CRM" and "conflict
// resolution" needed to mean anything real -- field mapping + conflict detection now apply
// here, not just on create.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawBody = await request.text();
    const { appId, tenantId, installId, permissions } = await authenticateMarketplaceAppRequest(request);
    if (!hasAppPermission(permissions, "leads", "write")) return forbidden("This app does not have permission to update leads");
    const body = rawBody ? JSON.parse(rawBody) : {};
    const user = { id: appId, tenantId };

    const current = await getLeadOrOpportunityForConflictCheck(user, "leads", id);
    if (!current) return badRequest("Lead not found");

    const { config, mappings } = await loadSyncContext(installId, "leads");
    const { expectedUpdatedAt, ...incoming } = body;
    const conflict = resolveUpdateConflict(config?.conflictResolution ?? "CRM_WINS", (current as any).updatedAt, expectedUpdatedAt);
    if (!conflict.allowed) return NextResponse.json({ message: conflict.reason, current }, { status: 409 });

    const translated = mappings.length ? applyFieldMapping(incoming, mappings, "toCrm") : incoming;
    const updated = await applyModuleUpdate(user, "leads", id, translated);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof MarketplaceAppAuthenticationError) return marketplaceAppAuthErrorResponse(error.reason);
    if (error instanceof SyntaxError) return badRequest("Request body must be valid JSON");
    return serverError("Failed to update lead", error);
  }
}
