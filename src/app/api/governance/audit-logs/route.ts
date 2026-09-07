import { NextResponse } from "next/server";
import { createAuditLog, listAuditLogsForTenant } from "@/lib/server/crm";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

// Entity types this codebase's own AuditLog writers already tag privacy-relevant events with
// (export.ts, communications.ts, privacy-postgres.ts) -- an admin picking the "Privacy" quick
// filter previously had to already know to type e.g. COMMUNICATION_CONSENT into a free-text
// box; this is the one place that list is defined.
const PRIVACY_ENTITY_TYPES = ["EXPORT_REQUEST", "COMMUNICATION_CONSENT", "COMMUNICATION_SUPPRESSION", "PRIVACY_REQUEST"];

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") ?? "";
    const entityId = searchParams.get("entityId") ?? "";
    const action = searchParams.get("action") ?? "";
    const category = searchParams.get("category") ?? "";
    const entityTypes = category === "privacy" ? PRIVACY_ENTITY_TYPES : undefined;
    const reviewStatus = searchParams.get("reviewStatus") ?? undefined;
    const flagged = searchParams.get("flagged") === "true";
    const legalHold = searchParams.get("legalHold") === "true";
    const dateFrom = searchParams.get("dateFrom") ?? undefined;
    const dateTo = searchParams.get("dateTo") ?? undefined;
    // "me" resolves to the caller's own id so a user can request their own activity without
    // needing to already know their own userId -- used by the new "My Activity" rollup view.
    const userIdParam = searchParams.get("userId") ?? undefined;
    const userId = userIdParam === "me" ? user.id : userIdParam;
    const logs = await listAuditLogsForTenant(user, {
      entityType: entityTypes ? undefined : entityType,
      entityTypes,
      entityId,
      action,
      reviewStatus,
      flagged,
      legalHold,
      dateFrom,
      dateTo,
      userId,
    });
    return NextResponse.json(logs);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch audit logs");
  }
}

// Gap checklist Module 10's "user-level audit of productivity actions" item, "command
// execution" -- the one named category with genuinely zero coverage anywhere (the global
// command palette had no telemetry at all). Deliberately narrow: this endpoint can ONLY write
// entityType "COMMAND" (not an arbitrary audit-log-injection surface for any authenticated
// client) -- it's the client reporting its own already-performed action, same trust level as
// the client already has to actually perform that action in the first place.
export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const commandId = typeof body?.commandId === "string" ? body.commandId.trim() : "";
    if (!commandId) return badRequest("commandId is required");
    await createAuditLog(user, "EXECUTE", "COMMAND", commandId, null, null, null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to record command execution");
  }
}
