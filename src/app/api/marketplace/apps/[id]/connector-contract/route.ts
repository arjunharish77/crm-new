import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getConnectorContractForApp } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const result = await getConnectorContractForApp(user, id);
    return NextResponse.json(result);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to load connector contract");
  }
}
