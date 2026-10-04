import { assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { forEachJourneyAudienceBatch } from "@/lib/server/marketing-journeys";
import { getLeadForTenant } from "@/lib/repositories/leads-postgres";
import { getOpportunityForTenant } from "@/lib/repositories/opportunities-postgres";
import { checkTelephonyComplianceForCall } from "@/lib/server/telephony-webhook";
import { requireTenantId } from "@/lib/server/tenant-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

const CAMPAIGN_COLUMNS = `id, name, description, module, "audienceType", "audienceConfig", "callScriptId", "dispositionGroupId", "assignedTeamId", "retryPolicy", "callbackPolicy", status, "createdAt", "updatedAt"`;

function hasCallCampaignAdminAccess(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

async function getTeamForTenant(tenantId: string, teamId: string) {
  return queryOne<{ id: string; name: string; leadId: string | null }>(
    'select id, name, "leadId" from "Team" where "tenantId"::text = $1 and id::text = $2',
    [tenantId, teamId],
  );
}

// Same recordAccess-based supervisor check call-queues.ts uses -- there's no separate
// "telephony campaigns" permission module, so this reuses the existing recordAccess levels
// rather than inventing a new permission axis.
function isQueueSupervisor(user: TenantUser, team: { leadId?: string | null } | null) {
  const permissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  if (permissions?.recordAccess === "ALL" || permissions?.recordAccess === "TEAM") return true;
  return !!team?.leadId && team.leadId === user.id;
}

async function isTeamMember(user: TenantUser, teamId: string) {
  const row = await queryOne<any>('select "teamId" from "User" where id::text = $1', [user.id]);
  return row?.teamId != null && String(row.teamId) === String(teamId);
}

export async function listCallCampaignsForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const [campaigns, memberCounts] = await Promise.all([
    query<any>(`select ${CAMPAIGN_COLUMNS} from "CallCampaign" where "tenantId" = $1 order by "createdAt" desc`, [tenantId]),
    query<{ campaignId: string; status: string; count: number }>(
      `select "campaignId", status, count(*)::int as count from "CallCampaignMember" where "tenantId" = $1 group by "campaignId", status`,
      [tenantId],
    ),
  ]);
  const countsByCampaign = new Map<string, Record<string, number>>();
  for (const row of memberCounts) {
    const bucket = countsByCampaign.get(row.campaignId) ?? {};
    bucket[row.status] = row.count;
    countsByCampaign.set(row.campaignId, bucket);
  }
  return campaigns.map((campaign) => ({ ...campaign, memberCounts: countsByCampaign.get(campaign.id) ?? {} }));
}

// "My campaigns" on the Call center page (UI/UX plan §5.14): active campaigns this person can
// take calls from -- the same rule getNextCampaignCallForAgent enforces (no assigned team, or a
// member or supervisor of it) -- with how many calls are due now.
export async function listMyCallCampaigns(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const campaigns = await query<any>(
    `select c.id, c.name, c.description, c.module, c."assignedTeamId", t.name as "assignedTeamName", t."leadId" as "teamLeadId",
            (select count(*)::int from "CallCampaignMember" m
              where m."tenantId" = c."tenantId" and m."campaignId" = c.id
                and (m.status = 'PENDING' or (m.status = 'QUEUED' and m."nextEligibleAt" <= now()))) as "dueNow"
     from "CallCampaign" c
     left join "Team" t on t."tenantId"::text = c."tenantId" and t.id::text = c."assignedTeamId"::text
     where c."tenantId" = $1 and c.status = 'ACTIVE'
     order by c.name`,
    [tenantId],
  );
  const userTeam = await queryOne<any>('select "teamId" from "User" where id::text = $1', [user.id]);
  return campaigns
    .filter((campaign) =>
      !campaign.assignedTeamId ||
      isQueueSupervisor(user, { leadId: campaign.teamLeadId }) ||
      (userTeam?.teamId != null && String(userTeam.teamId) === String(campaign.assignedTeamId)))
    .map(({ teamLeadId: _teamLeadId, ...campaign }) => campaign);
}

export async function getCallCampaignForTenant(user: TenantUser, id: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const campaign = await queryOne<any>(`select ${CAMPAIGN_COLUMNS} from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  if (!campaign) throw new Error("CALL_CAMPAIGN_NOT_FOUND");
  return campaign;
}

export async function createCallCampaignForTenant(user: TenantUser, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!hasCallCampaignAdminAccess(user)) throw new Error("FORBIDDEN");
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const campaignModule = input.module === "OPPORTUNITY" ? "OPPORTUNITY" : "LEAD";
  const audienceType = ["MANUAL", "LEAD_LIST", "SAVED_VIEW"].includes(String(input.audienceType)) ? String(input.audienceType) : "MANUAL";
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CallCampaign"
      (id, "tenantId", name, description, module, "audienceType", "audienceConfig", "callScriptId", "dispositionGroupId", "assignedTeamId", "retryPolicy", "callbackPolicy", status, "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', $13, $14, $14)
     returning ${CAMPAIGN_COLUMNS}`,
    [
      randomUUID(),
      tenantId,
      name,
      input.description ? String(input.description) : null,
      campaignModule,
      audienceType,
      input.audienceConfig ?? {},
      input.callScriptId || null,
      input.dispositionGroupId || null,
      input.assignedTeamId || null,
      input.retryPolicy ?? { maxAttempts: 3, retryDelayMinutes: 60 },
      input.callbackPolicy ?? { pauseUntilCallback: true },
      user.id,
      now,
    ],
  );
  await createAuditLog(user, "CREATE", "CALL_CAMPAIGN", row!.id, null, row, null).catch(() => undefined);
  return row;
}

export async function updateCallCampaignForTenant(user: TenantUser, id: string, input: Record<string, unknown>) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!hasCallCampaignAdminAccess(user)) throw new Error("FORBIDDEN");
  const existing = await queryOne<any>(`select ${CAMPAIGN_COLUMNS} from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  if (!existing) throw new Error("CALL_CAMPAIGN_NOT_FOUND");

  if ("status" in input && !["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].includes(String(input.status))) {
    throw new Error("INVALID_STATUS");
  }

  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `update "CallCampaign"
     set name = $1, description = $2, "callScriptId" = $3, "dispositionGroupId" = $4, "assignedTeamId" = $5,
         "retryPolicy" = $6, "callbackPolicy" = $7, status = $8, "updatedAt" = $9
     where "tenantId" = $10 and id = $11
     returning ${CAMPAIGN_COLUMNS}`,
    [
      "name" in input ? String(input.name ?? "").trim() || existing.name : existing.name,
      "description" in input ? input.description || null : existing.description,
      "callScriptId" in input ? input.callScriptId || null : existing.callScriptId,
      "dispositionGroupId" in input ? input.dispositionGroupId || null : existing.dispositionGroupId,
      "assignedTeamId" in input ? input.assignedTeamId || null : existing.assignedTeamId,
      "retryPolicy" in input ? input.retryPolicy : existing.retryPolicy,
      "callbackPolicy" in input ? input.callbackPolicy : existing.callbackPolicy,
      "status" in input ? input.status : existing.status,
      now,
      tenantId,
      id,
    ],
  );
  await createAuditLog(user, "UPDATE", "CALL_CAMPAIGN", id, existing, row, null).catch(() => undefined);
  return row;
}

export async function deleteCallCampaignForTenant(user: TenantUser, id: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!hasCallCampaignAdminAccess(user)) throw new Error("FORBIDDEN");
  await execute(`delete from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, id]);
  await createAuditLog(user, "DELETE", "CALL_CAMPAIGN", id, null, null, null).catch(() => undefined);
}

// Adds the campaign's configured audience (the journeys' MANUAL/LEAD_LIST/SAVED_VIEW resolution,
// all of it, a batch at a time; §8 #24: it took the first 500/1,000/5,000) as CallCampaignMember
// rows, skipping any already-a-member (the partial unique indexes on (campaignId, leadId)/
// (campaignId, opportunityId) make this an idempotent "top up the audience" operation, safe to
// call again after a SAVED_VIEW's live filter picks up new matches).
export async function addAudienceToCallCampaign(user: TenantUser, campaignId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!hasCallCampaignAdminAccess(user)) throw new Error("FORBIDDEN");
  const campaign = await queryOne<any>(`select ${CAMPAIGN_COLUMNS} from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, campaignId]);
  if (!campaign) throw new Error("CALL_CAMPAIGN_NOT_FOUND");

  let requested = 0;
  let added = 0;
  const now = new Date().toISOString();
  const column = campaign.module === "OPPORTUNITY" ? '"opportunityId"' : '"leadId"';
  await forEachJourneyAudienceBatch(user, campaign.module, campaign.audienceType, campaign.audienceConfig ?? {}, async (recordIds) => {
    requested += recordIds.length;
    added += await execute(
      `insert into "CallCampaignMember" (id, "tenantId", "campaignId", ${column}, status, "createdAt", "updatedAt")
       select gen_random_uuid()::text, $1, $2, record_id, 'PENDING', $4, $4 from unnest($3::text[]) as record_id
       on conflict do nothing`,
      [tenantId, campaignId, recordIds, now],
    );
  });
  return { requested, added };
}

export async function getCallCampaignProgressForTenant(user: TenantUser, campaignId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const rows = await query<{ status: string; count: number }>(
    `select status, count(*)::int as count from "CallCampaignMember" where "tenantId" = $1 and "campaignId" = $2 group by status`,
    [tenantId, campaignId],
  );
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byStatus[row.status] = row.count;
    total += row.count;
  }
  return { total, byStatus, completed: byStatus.COMPLETED ?? 0, exhausted: byStatus.EXHAUSTED ?? 0, doNotCall: byStatus.DO_NOT_CALL ?? 0 };
}

// Outcome analytics: joins each campaign member's linked Lead/Opportunity to its most recent
// CallDisposition logged since the campaign started, giving a real disposition breakdown --
// not just the member-status counts getCallCampaignProgressForTenant already reports.
export async function getCallCampaignAnalyticsForTenant(user: TenantUser, campaignId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const campaign = await queryOne<any>(`select "createdAt" from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, campaignId]);
  if (!campaign) throw new Error("CALL_CAMPAIGN_NOT_FOUND");

  const progress = await getCallCampaignProgressForTenant(user, campaignId);
  const attemptStats = await queryOne<{ avgAttempts: string; totalAttempts: string }>(
    `select coalesce(avg(attempts), 0) as "avgAttempts", coalesce(sum(attempts), 0) as "totalAttempts"
     from "CallCampaignMember" where "tenantId" = $1 and "campaignId" = $2`,
    [tenantId, campaignId],
  );

  const dispositionBreakdown = await query<{ outcomeName: string; count: number }>(
    `select coalesce(o.name, 'Unknown') as "outcomeName", count(*)::int as count
     from "CallCampaignMember" m
     join "CallDisposition" cd on (cd."leadId" = m."leadId" and m."leadId" is not null)
                                or (cd."opportunityId" = m."opportunityId" and m."opportunityId" is not null)
     left join "DispositionOutcome" o on o.id = cd."dispositionOutcomeId"
     where m."tenantId" = $1 and m."campaignId" = $2 and cd."createdAt" >= $3
     group by o.name
     order by count desc`,
    [tenantId, campaignId, campaign.createdAt],
  );

  return {
    ...progress,
    contactRate: progress.total > 0 ? Math.round((progress.completed / progress.total) * 10000) / 100 : 0,
    avgAttempts: Math.round(Number(attemptStats?.avgAttempts ?? 0) * 100) / 100,
    dispositionBreakdown,
  };
}

// Pull model, same as call-queues.ts's claim pattern but with FOR UPDATE SKIP LOCKED for
// genuine multi-agent-safe concurrency (call-queues' simpler "claimedBy is null" WHERE guard
// was sufficient for that lower-contention case; a campaign being worked by several agents at
// once is a real concurrent-access scenario this pattern is built for). Skips over any
// candidate blocked by the same DND/consent/quiet-hours compliance check click-to-call already
// enforces (checkTelephonyComplianceForCall), marking it DO_NOT_CALL rather than serving a
// blocked number to an agent.
export async function getNextCampaignCallForAgent(user: TenantUser, campaignId: string) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const campaign = await queryOne<any>(`select ${CAMPAIGN_COLUMNS} from "CallCampaign" where "tenantId" = $1 and id = $2`, [tenantId, campaignId]);
  if (!campaign) throw new Error("CALL_CAMPAIGN_NOT_FOUND");
  if (campaign.status !== "ACTIVE") throw new Error("CAMPAIGN_NOT_ACTIVE");

  if (campaign.assignedTeamId) {
    const team = await getTeamForTenant(tenantId, campaign.assignedTeamId);
    const allowed = isQueueSupervisor(user, team) || (await isTeamMember(user, campaign.assignedTeamId));
    if (!allowed) throw new Error("FORBIDDEN");
  }

  const maxAttempts = Number(campaign.retryPolicy?.maxAttempts ?? 3);
  const retryDelayMinutes = Number(campaign.retryPolicy?.retryDelayMinutes ?? 60);

  for (let attempt = 0; attempt < 5; attempt++) {
    const claimed = await queryOne<any>(
      `with candidate as (
         select id from "CallCampaignMember"
         where "tenantId" = $1 and "campaignId" = $2
           and (status = 'PENDING' or (status = 'QUEUED' and "nextEligibleAt" <= $3))
         order by attempts asc, "createdAt" asc
         limit 1
         for update skip locked
       )
       update "CallCampaignMember" m
       set status = 'QUEUED', attempts = m.attempts + 1, "assignedTo" = $4, "lastAttemptAt" = $3,
           "nextEligibleAt" = $3::timestamptz + ($5 || ' minutes')::interval, "updatedAt" = $3
       from candidate c
       where m.id = c.id
       returning m.*`,
      [tenantId, campaignId, new Date().toISOString(), user.id, retryDelayMinutes],
    );
    if (!claimed) return null;

    if (claimed.attempts > maxAttempts) {
      await execute(`update "CallCampaignMember" set status = 'EXHAUSTED', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), claimed.id]);
      continue;
    }

    const record = claimed.leadId ? await getLeadForTenant(user, claimed.leadId) : await getOpportunityForTenant(user, claimed.opportunityId);
    const phone = claimed.leadId ? record?.phone : record?.lead?.phone;
    if (phone) {
      const compliance = await checkTelephonyComplianceForCall(tenantId, phone, {
        entityType: claimed.leadId ? "LEAD" : "OPPORTUNITY",
        entityId: claimed.leadId ?? claimed.opportunityId,
      });
      if (!compliance.allowed) {
        await execute(`update "CallCampaignMember" set status = 'DO_NOT_CALL', "updatedAt" = $1 where id = $2`, [new Date().toISOString(), claimed.id]);
        continue;
      }
    }

    return { member: claimed, record };
  }
  return null;
}

export async function recordCallCampaignAttemptOutcome(
  user: TenantUser,
  memberId: string,
  outcome: { callbackAt?: string | null; disposed: boolean },
) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const status = outcome.callbackAt ? "CALLBACK_SCHEDULED" : "COMPLETED";
  await execute(
    `update "CallCampaignMember" set status = $1, "nextEligibleAt" = $2, "updatedAt" = $3 where "tenantId" = $4 and id = $5`,
    [status, outcome.callbackAt ?? null, now, tenantId, memberId],
  );
}
