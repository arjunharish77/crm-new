import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { rotateAppSigningSecret } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

// A new webhook signing secret, shown once; the old one keeps signing deliveries for 24 hours.
// Same access as rotating the API secret.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    return NextResponse.json(await rotateAppSigningSecret(user, id));
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to rotate the signing secret");
  }
}
