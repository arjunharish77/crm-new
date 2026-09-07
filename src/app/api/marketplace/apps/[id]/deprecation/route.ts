import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { setAppDeprecation } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

// Gap checklist Module 16's app dependency and compatibility checks, "deprecated app warning"
// sub-item -- an owner-set, informational signal (like trustLevel), not an install-blocking gate.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const app = await setAppDeprecation(user, id, Boolean(body?.isDeprecated), body?.message ?? null);
    return NextResponse.json(app);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to update app deprecation status");
  }
}
