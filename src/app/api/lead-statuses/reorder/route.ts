import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { reorderLeadStatusesForTenant } from "@/lib/repositories/lead-statuses-postgres";
import { leadStatusError } from "../errors";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await reorderLeadStatusesForTenant(user, Array.isArray(body?.ids) ? body.ids.map(String) : []));
  } catch (error) {
    return leadStatusError(error, "Failed to reorder lead statuses");
  }
}
