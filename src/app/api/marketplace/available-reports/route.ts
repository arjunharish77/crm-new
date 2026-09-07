import { NextResponse } from "next/server";
import { requireInternalUser } from "@/lib/server/auth";
import { listAvailableAppReportsForInstall } from "@/lib/server/marketplace";
import { marketplaceErrorResponse } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireInternalUser(request);
    const reports = await listAvailableAppReportsForInstall(user);
    return NextResponse.json(reports);
  } catch (error) {
    return marketplaceErrorResponse(error, "Failed to fetch available app reports");
  }
}
