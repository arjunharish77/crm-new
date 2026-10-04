import { getTenantTodayRange } from "@/lib/server/date-format";
import { assertTenantModule } from "@/lib/server/module-entitlements";
import { query } from "@/lib/db/query";
import { listCallDispositionsForTenant } from "@/lib/server/dispositions";
import { listAgentAvailabilityForTenant } from "@/lib/server/agent-availability";
import { getCallQueueHealthForTenant } from "@/lib/server/call-queues";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

function hasCallCenterSupervisorAccess(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

async function listCalls(tenantId: string, agentId: string | null, kind: "LIVE" | "MISSED_TODAY", limit: number) {
  // "Missed today" from the workspace's midnight, not the server's.
  const startOfToday = new Date((await getTenantTodayRange(tenantId)).start);
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const conditions = [`tcl."tenantId" = $1`];
  const values: unknown[] = [tenantId];
  if (kind === "LIVE") {
    // "Live" = not yet in any of TERMINAL_STATUSES from telephony-webhook.ts (duplicated
    // literal list rather than imported, matching this session's established precedent for
    // small self-contained constants), bounded to the last 4 hours so a call that never got a
    // terminal webhook event (a crashed/orphaned row) doesn't show as "live" forever.
    conditions.push(`tcl.status not in ('completed', 'missed', 'no-answer', 'failed', 'busy', 'voicemail')`);
    conditions.push(`tcl."startedAt" >= $${values.length + 1}`);
    values.push(fourHoursAgo.toISOString());
  } else {
    conditions.push(`tcl.status in ('missed', 'no-answer')`);
    conditions.push(`tcl."startedAt" >= $${values.length + 1}`);
    values.push(startOfToday.toISOString());
  }
  if (agentId) {
    conditions.push(`tcl."agentId" = $${values.length + 1}`);
    values.push(agentId);
  }
  values.push(limit);

  // Telephony references are UUIDs; core Lead/Opportunity ids are text. Cast the
  // reference rather than the indexed core id, which also supports non-UUID core ids.
  return query<any>(
    `select tcl.id, tcl.direction, tcl.status, tcl."fromNumber", tcl."toNumber", tcl."agentId", tcl."leadId", tcl."opportunityId",
            tcl."startedAt", l.name as "leadName", o.title as "opportunityTitle"
     from "TelephonyCallLog" tcl
     left join "Lead" l on l.id = tcl."leadId"::text
     left join "Opportunity" o on o.id = tcl."opportunityId"::text
     where ${conditions.join(" and ")}
     order by tcl."startedAt" desc
     limit $${values.length}`,
    values,
  );
}

async function listCallbacksDue(tenantId: string, createdBy: string | null, limit: number) {
  const windowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const conditions = [`cd."tenantId" = $1`, `cd."callbackAt" is not null`, `cd."callbackAt" <= $2`, `(t.id is null or t.status != 'COMPLETED')`];
  const values: unknown[] = [tenantId, windowEnd.toISOString()];
  if (createdBy) {
    conditions.push(`cd."createdBy" = $${values.length + 1}`);
    values.push(createdBy);
  }
  values.push(limit);

  return query<any>(
    `select cd.id, cd."callbackAt", cd."nextAction", cd."leadId", cd."opportunityId", cd."createdBy", cd."taskId",
            l.name as "leadName", l.phone as "leadPhone", o.title as "opportunityTitle"
     from "CallDisposition" cd
     left join "Task" t on t.id = cd."taskId"
     left join "Lead" l on l.id = cd."leadId"
     left join "Opportunity" o on o.id = cd."opportunityId"
     where ${conditions.join(" and ")}
     order by cd."callbackAt" asc
     limit $${values.length}`,
    values,
  );
}

async function listMyOpenLeads(tenantId: string, ownerId: string, limit: number) {
  return query<any>(
    `select id, name, phone, status, "updatedAt"
     from "Lead"
     where "tenantId" = $1 and "ownerId" = $2 and "deletedAt" is null
       -- Open-category statuses only (tenant-configurable, UI/UX plan decision 6).
       and crm_lead_status_category("tenantId", status) = 'OPEN'
     order by "updatedAt" desc
     limit $3`,
    [tenantId, ownerId, limit],
  );
}

async function listMyOpenOpportunities(tenantId: string, ownerId: string, limit: number) {
  return query<any>(
    `select op.id, op.title, op.amount, op."updatedAt", sd.name as "stageName"
     from "Opportunity" op
     left join "StageDefinition" sd on sd.id = op."stageId"
     where op."tenantId" = $1 and op."ownerId" = $2 and op."deletedAt" is null
       and coalesce(sd."isClosed", false) = false
     order by op."updatedAt" desc
     limit $3`,
    [tenantId, ownerId, limit],
  );
}

// Single aggregating read for the call center workspace page. "My" sections are scoped to the
// calling agent for every user; a supervisor (tenant/platform admin or modules.admin === "full",
// the same admin gate every other admin-config feature this session uses) additionally gets a
// "team" section -- tenant-wide live/missed calls, the existing agent availability roster, and
// tenant-wide recent dispositions and queue health.
export async function getCallCenterWorkspaceForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const isSupervisor = hasCallCenterSupervisorAccess(user);

  const [myLiveCalls, myMissedCallsToday, myCallbacksDue, myOpenLeads, myOpenOpportunities, myRecentDispositions] = await Promise.all([
    listCalls(tenantId, user.id, "LIVE", 20),
    listCalls(tenantId, user.id, "MISSED_TODAY", 20),
    listCallbacksDue(tenantId, user.id, 20),
    listMyOpenLeads(tenantId, user.id, 5),
    listMyOpenOpportunities(tenantId, user.id, 5),
    listCallDispositionsForTenant(user, { createdBy: user.id }),
  ]);

  let team = null;
  if (isSupervisor) {
    const [liveCalls, missedCallsToday, callbacksDue, agentAvailability, recentDispositions, queueHealth] = await Promise.all([
      listCalls(tenantId, null, "LIVE", 50),
      listCalls(tenantId, null, "MISSED_TODAY", 50),
      listCallbacksDue(tenantId, null, 50),
      listAgentAvailabilityForTenant(user),
      listCallDispositionsForTenant(user, {}),
      getCallQueueHealthForTenant(user),
    ]);
    team = { liveCalls, missedCallsToday, callbacksDue, agentAvailability, recentDispositions: recentDispositions.slice(0, 20), queueHealth };
  }

  return {
    isSupervisor,
    myLiveCalls,
    myMissedCallsToday,
    myCallbacksDue,
    myOpenLeads,
    myOpenOpportunities,
    myRecentDispositions: myRecentDispositions.slice(0, 20),
    team,
  };
}
