import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { uninstallApp } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const install = await uninstallApp(user, id);
    return NextResponse.json(install);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to uninstall app");
  }
}
