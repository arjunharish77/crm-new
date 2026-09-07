import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listAppSecretsMaskedForTenant } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const secrets = await listAppSecretsMaskedForTenant(user);
    return NextResponse.json(secrets);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch app secrets");
  }
}
