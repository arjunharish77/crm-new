import { assertTenantModule } from "@/lib/server/module-entitlements";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

const PRIORITY_ORDER: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

async function getTeamForTenant(tenantId: string, teamId: string) {
  return queryOne<{ id: string; name: string; leadId: string | null }>(
    'select id, name, "leadId" from "Team" where "tenantId"::text = $1 and id::text = $2',
    [tenantId, teamId],
  );
}

// Same recordAccess-based supervisor check as Task's queue system (tasks-postgres.ts) --
// there's no separate "telephony queues" permission module, so this reuses the existing
// recordAccess levels (TEAM/ALL) plus "is this team's own lead" rather than inventing a new
// permission axis. Call-center supervisors (admins, who are the ones shown the queue backlog in
// the call center) count too, so the Release button they see actually works.
function isQueueSupervisor(user: TenantUser, team: { leadId?: string | null } | null) {
  const permissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  if (user.isTenantAdmin || user.isPlatformAdmin || permissions?.modules?.admin === "full") return true;
  if (permissions?.recordAccess === "ALL" || permissions?.recordAccess === "TEAM") return true;
  return !!team?.leadId && team.leadId === user.id;
}

// A member is anyone on the team's member list (Settings › Teams) or whose primary team it is.
async function queueTeamIdsForMember(user: TenantUser, tenantId: string) {
  const rows = await query<{ teamId: string }>(
    `select "teamId"::text as "teamId" from "User" where id::text = $1 and "tenantId"::text = $2 and "teamId" is not null
     union
     select "teamId"::text from "TeamMember" where "userId"::text = $1 and "tenantId"::text = $2
     union
     select id::text from "Team" where "leadId"::text = $1 and "tenantId"::text = $2`,
    [user.id, tenantId],
  );
  return new Set(rows.map((row) => String(row.teamId)));
}

async function isQueueMember(user: TenantUser, tenantId: string, teamId: string) {
  return (await queueTeamIdsForMember(user, tenantId)).has(String(teamId));
}

// Supervisors (by recordAccess or admin) see every queue; everyone else only their own teams'.
function seesEveryQueue(user: TenantUser) {
  return isQueueSupervisor(user, null);
}

// Routing entry point -- called from recordTelephonyCallEvent for a newly-created call that
// needs triage (a missed call, or an inbound call with no resolved Lead/Opportunity). Only
// queues once per call: if this row is already queued (e.g. a duplicate routing attempt),
// this is a no-op rather than re-queuing/resetting its wait-time clock.
export async function queueTelephonyCall(
  tenantId: string,
  callLogId: string,
  input: { teamId: string; queueType: "INBOUND" | "MISSED_CALLBACK" | "CAMPAIGN" | "PARTNER"; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT" },
) {
  const now = new Date().toISOString();
  await execute(
    `update "TelephonyCallLog"
     set "queueId" = $1, "queueType" = $2, priority = $3, "queuedAt" = $4
     where id = $5 and "tenantId" = $6 and "queueId" is null`,
    [input.teamId, input.queueType, input.priority ?? "MEDIUM", now, callLogId, tenantId],
  );
}

// Called when a call is resolved (a disposition is logged against it) so it drops out of the
// backlog -- claiming a call doesn't do this on its own, since a claimed-but-not-yet-disposed
// call should still show as "in progress," not silently vanish from the queue.
export async function removeCallFromQueue(tenantId: string, callLogId: string) {
  await execute(
    `update "TelephonyCallLog"
     set "queueId" = null, "queueType" = null, "queuedAt" = null, "claimedBy" = null, "claimedAt" = null
     where id = $1 and "tenantId" = $2`,
    [callLogId, tenantId],
  );
}

// Mirrors getQueueHealthForTenant's shape in tasks-postgres.ts (totalQueued/unclaimed/
// avgAgeMinutes/oldestAgeMinutes) for UI consistency with the existing Task queue health page
// -- no "slaBreaches" field here, since (unlike Task) TelephonyCallLog has no per-row SLA
// target concept to breach; that's a real, stated difference, not an oversight.
export async function getCallQueueHealthForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const rows = await query<any>(
    `select tcl."queueId", t.name as "teamName", tcl."queuedAt", tcl."claimedBy"
     from "TelephonyCallLog" tcl
     join "Team" t on t.id = tcl."queueId"
     where tcl."tenantId" = $1 and tcl."queueId" is not null`,
    [tenantId],
  );

  const visibleTeamIds = seesEveryQueue(user) ? null : await queueTeamIdsForMember(user, tenantId);
  const byQueue = new Map<string, { teamId: string; teamName: string; ages: number[]; unclaimed: number }>();
  const now = Date.now();
  for (const row of rows) {
    const key = String(row.queueId);
    if (visibleTeamIds && !visibleTeamIds.has(key)) continue;
    const bucket = byQueue.get(key) ?? { teamId: key, teamName: row.teamName, ages: [] as number[], unclaimed: 0 };
    const ageMinutes = (now - new Date(row.queuedAt).getTime()) / 60000;
    bucket.ages.push(ageMinutes);
    if (!row.claimedBy) bucket.unclaimed += 1;
    byQueue.set(key, bucket);
  }

  return [...byQueue.values()]
    .map((bucket) => ({
      teamId: bucket.teamId,
      teamName: bucket.teamName,
      totalQueued: bucket.ages.length,
      unclaimed: bucket.unclaimed,
      avgAgeMinutes: bucket.ages.length ? Math.round(bucket.ages.reduce((sum, age) => sum + age, 0) / bucket.ages.length) : 0,
      oldestAgeMinutes: bucket.ages.length ? Math.round(Math.max(...bucket.ages)) : 0,
    }))
    .sort((a, b) => b.unclaimed - a.unclaimed);
}

// SLA-based ordering: unclaimed calls first, then by priority (URGENT > HIGH > MEDIUM > LOW),
// then oldest-queued first within the same priority -- a real priority-aware order, not just
// FIFO-by-queuedAt (the pre-existing Task queue's own ordering has no priority factor at all;
// this is a deliberate improvement for calls, not a blind copy of that precedent).
export async function listQueuedCallsForTeam(user: TenantUser, teamId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const team = await getTeamForTenant(tenantId, teamId);
  if (!team) throw new Error("TEAM_NOT_FOUND");
  if (!isQueueSupervisor(user, team) && !(await isQueueMember(user, tenantId, teamId))) throw new Error("FORBIDDEN");
  const rows = await query<any>(
    `select tcl.id, tcl."queueType", tcl.priority, tcl."queuedAt", tcl."claimedBy", tcl."claimedAt",
            tcl."fromNumber", tcl."toNumber", tcl."leadId", tcl."opportunityId",
            l.name as "leadName", o.title as "opportunityTitle"
     from "TelephonyCallLog" tcl
     left join "Lead" l on l.id = tcl."leadId"::text and l."tenantId" = tcl."tenantId"
     left join "Opportunity" o on o.id = tcl."opportunityId"::text and o."tenantId" = tcl."tenantId"
     where tcl."tenantId" = $1 and tcl."queueId"::text = $2
     order by (tcl."claimedBy" is null) desc, tcl."queuedAt" asc
     limit 200`,
    [tenantId, teamId],
  );
  return rows
    .map((row: any) => ({ ...row, priorityRank: PRIORITY_ORDER[String(row.priority)] ?? 0 }))
    .sort((a: any, b: any) => {
      if ((a.claimedBy == null) !== (b.claimedBy == null)) return a.claimedBy == null ? -1 : 1;
      if (a.priorityRank !== b.priorityRank) return b.priorityRank - a.priorityRank;
      return new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime();
    });
}

// True atomic claim (unlike Task's own claimTaskForTenant, which does a check-then-act SELECT
// followed by an unconditional UPDATE -- a real race window where two agents claiming
// simultaneously could both "succeed"). Here the `"claimedBy" is null` guard is part of the
// UPDATE's WHERE clause itself, so only one caller can ever win a given call.
export async function claimQueuedCall(user: TenantUser, callLogId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const call = await queryOne<any>(`select "queueId" from "TelephonyCallLog" where id = $1 and "tenantId" = $2`, [callLogId, tenantId]);
  if (!call?.queueId) throw new Error("CALL_NOT_QUEUED");
  const team = await getTeamForTenant(tenantId, call.queueId);
  const allowed = isQueueSupervisor(user, team) || (await isQueueMember(user, tenantId, call.queueId));
  if (!allowed) throw new Error("FORBIDDEN");

  const now = new Date().toISOString();
  const claimed = await queryOne<any>(
    `update "TelephonyCallLog"
     set "claimedBy" = $1, "claimedAt" = $2
     where id = $3 and "tenantId" = $4 and "claimedBy" is null
     returning *`,
    [user.id, now, callLogId, tenantId],
  );
  if (!claimed) throw new Error("ALREADY_CLAIMED");
  await createAuditLog(user, "CLAIM", "TELEPHONY_CALL_QUEUE", callLogId, null, claimed, null).catch(() => undefined);
  return claimed;
}

export async function releaseQueuedCall(user: TenantUser, callLogId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const call = await queryOne<any>(`select "queueId", "claimedBy" from "TelephonyCallLog" where id = $1 and "tenantId" = $2`, [callLogId, tenantId]);
  if (!call?.queueId) throw new Error("CALL_NOT_QUEUED");
  const team = await getTeamForTenant(tenantId, call.queueId);
  const allowed = call.claimedBy === user.id || isQueueSupervisor(user, team);
  if (!allowed) throw new Error("FORBIDDEN");

  const released = await queryOne<any>(
    `update "TelephonyCallLog" set "claimedBy" = null, "claimedAt" = null where id = $1 and "tenantId" = $2 returning *`,
    [callLogId, tenantId],
  );
  await createAuditLog(user, "RELEASE", "TELEPHONY_CALL_QUEUE", callLogId, call, released, null).catch(() => undefined);
  return released;
}
