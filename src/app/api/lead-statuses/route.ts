import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { createLeadStatusForTenant, listLeadStatusesForTenant } from "@/lib/repositories/lead-statuses-postgres";
import { leadStatusError } from "./errors";

// The tenant's lead statuses (UI/UX plan decision 6). Everyone in the tenant can read them (they
// drive status pickers and labels); `?all=1` (admins) includes turned-off ones and lead counts.
export async function GET(request: Request) {
  try {
    const all = new URL(request.url).searchParams.get("all") === "1";
    const user = all ? await requireTenantAdmin(request) : await requireCurrentUser(request);
    return NextResponse.json(await listLeadStatusesForTenant(user, { includeInactive: all, withCounts: all }));
  } catch (error) {
    return leadStatusError(error, "Failed to load lead statuses");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await createLeadStatusForTenant(user, body ?? {}), { status: 201 });
  } catch (error) {
    return leadStatusError(error, "Failed to create lead status");
  }
}
