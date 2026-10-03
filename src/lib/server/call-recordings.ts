import { assertTenantModule } from "@/lib/server/module-entitlements";
import { query, queryOne, execute, queryAsSystem, executeAsSystem } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function hasRecordingAdminAccess(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

// Metadata only -- the raw recordingUrl is deliberately never included here. A caller who
// wants to actually play/download a specific recording must go through
// getCallRecordingForTenant below, which is the one place a permission check and an audit log
// entry both happen. Listing metadata itself is scoped by record access to the given Lead/
// Opportunity (same getLeadForTenant/getOpportunityForTenant pattern used for click-to-call and
// call dispositions), not a separate admin gate -- anyone who can already see the record can
// see that a call happened and whether it has a recording, just not play it without the
// explicit, audited action.
export async function listCallRecordingsForTenant(
  user: TenantUser,
  filter: { leadId?: string | null; opportunityId?: string | null },
) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (filter.leadId) {
    const lead = await getLeadForTenant(user, filter.leadId);
    if (!lead) throw new Error("LEAD_NOT_FOUND");
  }
  if (filter.opportunityId) {
    const opportunity = await getOpportunityForTenant(user, filter.opportunityId);
    if (!opportunity) throw new Error("OPPORTUNITY_NOT_FOUND");
  }
  if (!filter.leadId && !filter.opportunityId) return [];

  const conditions = [`"tenantId" = $1`];
  const values: unknown[] = [tenantId];
  if (filter.leadId) {
    conditions.push(`"leadId" = $${values.length + 1}`);
    values.push(filter.leadId);
  }
  if (filter.opportunityId) {
    conditions.push(`"opportunityId" = $${values.length + 1}`);
    values.push(filter.opportunityId);
  }

  const rows = await query<any>(
    `select id, provider, direction, status, duration, "agentId", "leadId", "opportunityId",
            "startedAt", "endedAt", transcript, "recordingExpiresAt",
            ("recordingUrl" is not null) as "hasRecording"
     from "TelephonyCallLog"
     where ${conditions.join(" and ")}
     order by "startedAt" desc
     limit 100`,
    values,
  );

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    isExpired: row.hasRecording && row.recordingExpiresAt ? new Date(row.recordingExpiresAt).getTime() <= now : false,
  }));
}

// The one gated path to an actual recording URL. Access is granted to: a tenant/platform
// admin, the agent who was on the call, or anyone with record access to the call's linked
// Lead/Opportunity (mirrors the same getLeadForTenant/getOpportunityForTenant scoping used
// elsewhere this session) -- deliberately broader than an admin-only gate, since reps need to
// review their own calls, but never a blanket "any authenticated user in the tenant" the way
// the pre-existing Telephony settings route exposed the webhook secret before this session's
// earlier fix.
export async function getCallRecordingForTenant(user: TenantUser, callLogId: string, action: "PLAY" | "DOWNLOAD") {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const call = await queryOne<any>(
    `select id, "recordingUrl", transcript, "recordingExpiresAt", "agentId", "leadId", "opportunityId"
     from "TelephonyCallLog" where "tenantId" = $1 and id = $2 limit 1`,
    [tenantId, callLogId],
  );
  if (!call) throw new Error("CALL_LOG_NOT_FOUND");

  let allowed = hasRecordingAdminAccess(user) || call.agentId === user.id;
  if (!allowed && call.leadId) allowed = !!(await getLeadForTenant(user, call.leadId));
  if (!allowed && call.opportunityId) allowed = !!(await getOpportunityForTenant(user, call.opportunityId));
  if (!allowed) throw new Error("FORBIDDEN");

  if (!call.recordingUrl) throw new Error("RECORDING_NOT_AVAILABLE");
  if (call.recordingExpiresAt && new Date(call.recordingExpiresAt).getTime() <= Date.now()) throw new Error("RECORDING_EXPIRED");

  await createAuditLog(user, action, "TELEPHONY_RECORDING", callLogId, null, { action }, null).catch(() => undefined);

  return { recordingUrl: call.recordingUrl as string, transcript: call.transcript as string | null };
}

// Worker job (telephony.expireRecordings): clears recordingUrl for any call whose
// recordingExpiresAt has passed, following the exact shape of processExpiredExportFiles
// (src/lib/server/exports.ts) -- the row and its metadata (status/duration/transcript) stay,
// only the recording itself is dropped, so call history isn't lost, just the audio.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job, discovers expired
// recordings across every tenant at once.
export async function expireCallRecordings(limit = 100) {
  const due = await queryAsSystem<{ id: string }>(
    `select id from "TelephonyCallLog" where "recordingUrl" is not null and "recordingExpiresAt" is not null and "recordingExpiresAt" <= $1 limit $2`,
    [new Date().toISOString(), limit],
  );
  for (const row of due) {
    await executeAsSystem(`update "TelephonyCallLog" set "recordingUrl" = null where id = $1`, [row.id]);
  }
  return { processed: due.length };
}
