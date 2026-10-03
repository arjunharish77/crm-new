import { NextResponse } from "next/server";
import { updateLeadForTenant } from "@/lib/server/crm";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

const MAX = 1000;

// Change the status of many leads (UI/UX plan §11.4, "Bulk change status"). Each lead goes
// through the normal update, so record access, field permissions, the audit log, automations
// and webhooks all apply as for a single change. Returns how many changed and which failed.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids) ? [...new Set<string>(body.ids.filter((id: unknown) => typeof id === "string" && id))] : [];
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    if (!ids.length) return badRequest("Choose at least one lead");
    if (ids.length > MAX) return badRequest(`At most ${MAX.toLocaleString()} leads can be changed at once. Narrow the selection.`);
    if (!status) return badRequest("Choose a status");

    let updated = 0;
    const failed: Array<{ id: string; reason: string }> = [];
    for (const id of ids) {
      try {
        const lead = await updateLeadForTenant(user, id, { status });
        if (lead) updated += 1;
        else failed.push({ id, reason: "Not found" });
      } catch (error) {
        const code = error instanceof Error ? error.message : "";
        if (code === "LEAD_STATUS_UNKNOWN") return badRequest("Unknown lead status");
        failed.push({ id, reason: code.startsWith("DUPLICATE_RULE_BLOCK") ? "Blocked by a duplicate rule" : "Couldn't update" });
      }
    }
    return NextResponse.json({ updated, failed });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to change lead statuses", error);
  }
}
