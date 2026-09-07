import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { requestPublishApp } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const app = await requestPublishApp(user, id);
    return NextResponse.json(app);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to request publishing");
  }
}
