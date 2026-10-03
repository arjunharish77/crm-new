import { assertModuleEnabled, assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { query, queryAsSystem, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { leadAudienceForList } from "@/lib/repositories/lead-lists-postgres";
import { countLeadAudienceForTenant, getPendingNbaCountMap, listLeadAudiencePageForTenant, type LeadAudienceQuery } from "@/lib/repositories/leads-postgres";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import { toServerQuery } from "@/components/views/smart-view-server-query";
import { assertTemplatesSendableForTenant, expandSnippetsForTenant, queueCommunicationForTenant, renderTemplate } from "@/lib/server/communications";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

type Channel = "EMAIL" | "WHATSAPP" | "SMS";
type CampaignStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SCHEDULED" | "RUNNING" | "COMPLETED" | "PAUSED" | "CANCELLED";
type AudienceType = "LEAD_LIST" | "SAVED_VIEW" | "MANUAL";

type CampaignInput = {
  name?: string;
  description?: string | null;
  channel?: Channel;
  campaignType?: "BROADCAST" | "DRIP";
  audienceType?: AudienceType;
  audienceConfig?: Record<string, any>;
  templateId?: string | null;
  providerConfigId?: string | null;
  senderIdentityId?: string | null;
  subject?: string | null;
  body?: string | null;
  tokens?: Record<string, unknown>;
  utmDefaults?: Record<string, unknown>;
  fallbackConfig?: Record<string, unknown>;
  throttlePerMinute?: number;
  quietHours?: Record<string, unknown>;
  scheduledAt?: string | null;
  steps?: CampaignStepInput[];
};

type CampaignStepInput = {
  id?: string;
  stepOrder?: number;
  delayMinutes?: number;
  channel?: Channel;
  templateId?: string | null;
  subject?: string | null;
  body?: string | null;
  fallbackChannel?: Channel | null;
  metadata?: Record<string, unknown>;
};

const CAMPAIGN_COLUMNS = `id, "tenantId", name, description, channel, "campaignType", status, "audienceType", "audienceConfig",
  "templateId", "providerConfigId", "senderIdentityId", subject, body, tokens, "utmDefaults", "fallbackConfig",
  "throttlePerMinute", "quietHours", "scheduledAt", "approvedBy", "approvedAt", "createdBy", "updatedBy", "createdAt", "updatedAt",
  "launchState"`;

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function normalizeChannel(channel: unknown): Channel {
  const value = String(channel ?? "EMAIL").toUpperCase();
  if (value === "EMAIL" || value === "WHATSAPP" || value === "SMS") return value;
  throw new Error("INVALID_COMMUNICATION_CHANNEL");
}

function normalizeAudienceType(value: unknown): AudienceType {
  const type = String(value ?? "LEAD_LIST").toUpperCase();
  if (type === "LEAD_LIST" || type === "SAVED_VIEW" || type === "MANUAL") return type;
  return "LEAD_LIST";
}

function recipientFieldForChannel(channel: Channel) {
  return channel === "EMAIL" ? "email" : "phone";
}

function normalizeRecipient(channel: Channel, value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return channel === "EMAIL" ? text.toLowerCase() : text.replace(/\s+/g, "");
}

function leadTokens(lead: any, extra: Record<string, unknown> = {}) {
  return {
    leadId: lead.id,
    leadName: lead.name ?? "",
    name: lead.name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    company: lead.company ?? "",
    source: lead.source ?? "",
    status: lead.status ?? "",
    score: lead.score ?? "",
    ...extra,
  };
}

async function listCampaignSteps(tenantId: string, campaignIds: string[]) {
  if (campaignIds.length === 0) return new Map<string, any[]>();
  const rows = await query<any>(
    `select id, "tenantId", "campaignId", "stepOrder", "delayMinutes", channel, "templateId", subject, body, "fallbackChannel", metadata, "createdAt", "updatedAt"
     from "MarketingCampaignStep"
     where "tenantId" = $1 and "campaignId" = any($2::text[])
     order by "stepOrder" asc`,
    [tenantId, campaignIds],
  );
  const byCampaign = new Map<string, any[]>();
  for (const row of rows) byCampaign.set(row.campaignId, [...(byCampaign.get(row.campaignId) ?? []), row]);
  return byCampaign;
}

async function campaignStats(tenantId: string, campaignIds: string[]) {
  if (campaignIds.length === 0) return new Map<string, any>();
  const rows = await query<any>(
    `select
       r."campaignId",
       count(*)::int as recipients,
       count(*) filter (where r.status = 'QUEUED')::int as queued,
       count(*) filter (where r.status = 'SENT')::int as sent,
       count(*) filter (where r.status = 'FAILED')::int as failed,
       count(*) filter (where r.status = 'SUPPRESSED')::int as suppressed,
       count(e.*) filter (where e."eventType" in ('OPENED', 'OPEN'))::int as opened,
       count(e.*) filter (where e."eventType" in ('CLICKED', 'CLICK'))::int as clicked,
       count(e.*) filter (where e."eventType" in ('REPLIED', 'REPLY'))::int as replied,
       count(e.*) filter (where e."eventType" in ('BOUNCED', 'BOUNCE'))::int as bounced,
       count(e.*) filter (where e."eventType" in ('UNSUBSCRIBED', 'OPTED_OUT'))::int as unsubscribed
     from "MarketingCampaignRecipient" r
     left join "CommunicationDeliveryEvent" e on e."tenantId" = r."tenantId" and e."outboxId" = r."outboxId"
     where r."tenantId" = $1 and r."campaignId" = any($2::text[])
     group by r."campaignId"`,
    [tenantId, campaignIds],
  );
  return new Map(rows.map((row) => [row.campaignId, row]));
}

export async function listMarketingCampaignsForTenant(user: TenantUser) {
  await assertTenantModule(user, "MARKETING");
  const tenantId = requireTenantId(user);
  const rows = await query<any>(
    `select ${CAMPAIGN_COLUMNS}
     from "MarketingCampaign"
     where "tenantId" = $1
     order by "updatedAt" desc`,
    [tenantId],
  );
  const ids = rows.map((row) => row.id);
  const steps = await listCampaignSteps(tenantId, ids);
  const stats = await campaignStats(tenantId, ids);
  return rows.map((row) => ({ ...row, steps: steps.get(row.id) ?? [], stats: stats.get(row.id) ?? defaultStats() }));
}

export async function getMarketingCampaignForTenant(user: TenantUser, id: string) {
  await assertTenantModule(user, "MARKETING");
  const tenantId = requireTenantId(user);
  const row = await queryOne<any>(
    `select ${CAMPAIGN_COLUMNS}
     from "MarketingCampaign"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [tenantId, id],
  );
  if (!row) return null;
  const steps = await listCampaignSteps(tenantId, [row.id]);
  const stats = await campaignStats(tenantId, [row.id]);
  return { ...row, steps: steps.get(row.id) ?? [], stats: stats.get(row.id) ?? defaultStats() };
}

function defaultStats() {
  return { recipients: 0, queued: 0, sent: 0, failed: 0, suppressed: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, unsubscribed: 0 };
}

export async function upsertMarketingCampaignForTenant(user: TenantUser, input: CampaignInput & { id?: string }) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "MARKETING", { isPlatformAdmin: user.isPlatformAdmin });
  const now = new Date().toISOString();
  const id = input.id || randomUUID();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("CAMPAIGN_NAME_REQUIRED");
  const channel = normalizeChannel(input.channel);
  const body = String(input.body ?? "").trim();
  const campaignType = input.campaignType === "DRIP" ? "DRIP" : "BROADCAST";
  if (!body && campaignType === "BROADCAST" && !input.templateId) throw new Error("CAMPAIGN_BODY_OR_TEMPLATE_REQUIRED");

  const before = input.id ? await getMarketingCampaignForTenant(user, input.id) : null;
  // Once a campaign has started, what it sends can't change (decision 29: what runs only changes
  // through the approval and launch steps).
  if (before && CAMPAIGN_LOCKED_STATUSES.includes(before.status)) throw new Error("CAMPAIGN_LOCKED");
  const row = await queryOne<any>(
    `insert into "MarketingCampaign"
      (id, "tenantId", name, description, channel, "campaignType", "audienceType", "audienceConfig", "templateId",
       "providerConfigId", "senderIdentityId", subject, body, tokens, "utmDefaults", "fallbackConfig", "throttlePerMinute",
       "quietHours", "scheduledAt", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $20, $21, $21)
     on conflict (id) do update set
       name = excluded.name,
       description = excluded.description,
       channel = excluded.channel,
       "campaignType" = excluded."campaignType",
       "audienceType" = excluded."audienceType",
       "audienceConfig" = excluded."audienceConfig",
       "templateId" = excluded."templateId",
       "providerConfigId" = excluded."providerConfigId",
       "senderIdentityId" = excluded."senderIdentityId",
       subject = excluded.subject,
       body = excluded.body,
       tokens = excluded.tokens,
       "utmDefaults" = excluded."utmDefaults",
       "fallbackConfig" = excluded."fallbackConfig",
       "throttlePerMinute" = excluded."throttlePerMinute",
       "quietHours" = excluded."quietHours",
       "scheduledAt" = excluded."scheduledAt",
       "updatedBy" = excluded."updatedBy",
       "updatedAt" = excluded."updatedAt"
     returning ${CAMPAIGN_COLUMNS}`,
    [
      id,
      tenantId,
      name,
      input.description || null,
      channel,
      campaignType,
      normalizeAudienceType(input.audienceType),
      input.audienceConfig ?? {},
      input.templateId || null,
      input.providerConfigId || null,
      input.senderIdentityId || null,
      input.subject || null,
      body,
      input.tokens ?? {},
      input.utmDefaults ?? {},
      input.fallbackConfig ?? {},
      Number(input.throttlePerMinute || 60),
      input.quietHours ?? { enabled: true, start: "21:00", end: "09:00" },
      input.scheduledAt || null,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("MARKETING_CAMPAIGN_UPSERT_FAILED");
  await replaceCampaignSteps(user, row.id, channel, campaignType, input.steps ?? []);
  let after = await getMarketingCampaignForTenant(user, row.id);
  // Changing what an approved (or pending, or scheduled) campaign sends sends it back to Draft:
  // it needs approval again before it can launch. Its name and description don't count.
  if (before && after && CAMPAIGN_APPROVAL_STATUSES.includes(before.status) && campaignContentKey(before) !== campaignContentKey(after)) {
    await query(
      `update "MarketingCampaign" set status = 'DRAFT', "approvedBy" = null, "approvedAt" = null, "updatedAt" = $3 where "tenantId" = $1 and id = $2`,
      [tenantId, row.id, now],
    );
    after = await getMarketingCampaignForTenant(user, row.id);
    if (after) after = { ...after, approvalReset: true };
  }
  await createAuditLog(user as any, before ? "UPDATE" : "CREATE", "MARKETING_CAMPAIGN", row.id, before, after, { channel }).catch(() => undefined);
  return after;
}

const CAMPAIGN_LOCKED_STATUSES: string[] = ["RUNNING", "PAUSED", "COMPLETED", "CANCELLED"];
const CAMPAIGN_APPROVAL_STATUSES: string[] = ["PENDING_APPROVAL", "APPROVED", "SCHEDULED"];

// What a campaign sends and to whom, for telling whether a save changed it.
function campaignContentKey(campaign: any) {
  const stable = (value: unknown): string => Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as any)[key])}`).join(",")}}`
      : JSON.stringify(value ?? null);
  const steps = (campaign.steps ?? []).map((step: any) => ({
    stepOrder: step.stepOrder, delayMinutes: step.delayMinutes, channel: step.channel, templateId: step.templateId ?? null,
    subject: step.subject ?? null, body: step.body ?? "", fallbackChannel: step.fallbackChannel ?? null,
  }));
  return stable({
    channel: campaign.channel, campaignType: campaign.campaignType, audienceType: campaign.audienceType, audienceConfig: campaign.audienceConfig ?? {},
    templateId: campaign.templateId ?? null, providerConfigId: campaign.providerConfigId ?? null, senderIdentityId: campaign.senderIdentityId ?? null,
    subject: campaign.subject ?? null, body: campaign.body ?? "", tokens: campaign.tokens ?? {}, utmDefaults: campaign.utmDefaults ?? {},
    fallbackConfig: campaign.fallbackConfig ?? {}, throttlePerMinute: campaign.throttlePerMinute, quietHours: campaign.quietHours ?? null,
    scheduledAt: campaign.scheduledAt ? new Date(campaign.scheduledAt).toISOString() : null, steps,
  });
}

async function replaceCampaignSteps(user: TenantUser, campaignId: string, defaultChannel: Channel, campaignType: "BROADCAST" | "DRIP", steps: CampaignStepInput[]) {
  const tenantId = requireTenantId(user);
  await query(`delete from "MarketingCampaignStep" where "tenantId" = $1 and "campaignId" = $2`, [tenantId, campaignId]);
  const normalized = campaignType === "DRIP" ? steps.filter((step) => step.body?.trim() || step.templateId) : [];
  if (normalized.length === 0) return;
  const now = new Date().toISOString();
  for (let index = 0; index < normalized.length; index += 1) {
    const step = normalized[index];
    await query(
      `insert into "MarketingCampaignStep"
        (id, "tenantId", "campaignId", "stepOrder", "delayMinutes", channel, "templateId", subject, body, "fallbackChannel", metadata, "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
      [
        step.id || randomUUID(),
        tenantId,
        campaignId,
        Number(step.stepOrder || index + 1),
        Math.max(0, Number(step.delayMinutes || 0)),
        normalizeChannel(step.channel || defaultChannel),
        step.templateId || null,
        step.subject || null,
        String(step.body || ""),
        step.fallbackChannel ? normalizeChannel(step.fallbackChannel) : null,
        step.metadata ?? {},
        now,
      ],
    );
  }
}

// Gap checklist Module 10's "approval inbox" item, "campaign approvals" sub-item -- real bug
// found and fixed while wiring this into the unified inbox: updateMarketingCampaignStatusForTenant
// previously accepted ANY status with no transition validation at all, so a campaign could jump
// straight from DRAFT to RUNNING, silently bypassing PENDING_APPROVAL/APPROVED entirely --
// "approval" was a label a status COULD pass through, never a gate anything actually enforced.
// Mirrors the same ALLOWED_TRANSITIONS guard payouts.ts's own transitionPayoutStatus already uses.
const CAMPAIGN_ALLOWED_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["SCHEDULED", "RUNNING", "DRAFT", "CANCELLED"],
  SCHEDULED: ["RUNNING", "CANCELLED"],
  RUNNING: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["RUNNING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function updateMarketingCampaignStatusForTenant(user: TenantUser, id: string, status: CampaignStatus) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "MARKETING", { isPlatformAdmin: user.isPlatformAdmin });
  const before = await getMarketingCampaignForTenant(user, id);
  if (!before) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
  // A same-status "transition" is always allowed as a no-op -- launchMarketingCampaignForTenant
  // (below) can legitimately re-invoke this with "RUNNING" while a drip campaign's status is
  // already RUNNING, which isn't a real state change to validate against the transition map.
  if (status !== before.status && !CAMPAIGN_ALLOWED_TRANSITIONS[before.status as CampaignStatus]?.includes(status)) {
    throw new Error(`INVALID_CAMPAIGN_TRANSITION: ${before.status} -> ${status}`);
  }
  const now = new Date().toISOString();
  const updates: string[] = ['status = $3', '"updatedBy" = $4', '"updatedAt" = $5'];
  const values: unknown[] = [tenantId, id, status, user.id, now];
  if (status === "APPROVED") {
    updates.push('"approvedBy" = $4', '"approvedAt" = $5');
  }
  const row = await queryOne<any>(
    `update "MarketingCampaign"
     set ${updates.join(", ")}
     where "tenantId" = $1 and id = $2
     returning ${CAMPAIGN_COLUMNS}`,
    values,
  );
  const after = row ? await getMarketingCampaignForTenant(user, row.id) : null;
  await createAuditLog(user as any, "UPDATE", "MARKETING_CAMPAIGN", id, before, after, { status }).catch(() => undefined);
  return after;
}

export async function previewMarketingCampaignAudienceForTenant(user: TenantUser, input: Pick<CampaignInput, "audienceType" | "audienceConfig" | "channel">) {
  await assertTenantModule(user, "MARKETING");
  const channel = normalizeChannel(input.channel);
  const records = await resolveAudience(user, normalizeAudienceType(input.audienceType), input.audienceConfig ?? {}, channel, 100);

  // "Recommendation surfaces... marketing campaign audience builder" (gap checklist: "NBA
  // recommendation surfaces") -- this screen has no persistent per-record detail view the way
  // Lead/Opportunity detail pages do (confirmed directly: audience preview is a flat,
  // potentially-large recipient sample, not a record workspace), so a per-row expand/collapse
  // is the real surface here: each LEAD-backed sample row gets its own bulk-computed
  // pendingNbaCount (the same lookup the Leads list page's count-chip column already relies
  // on) to render a real NbaCountChip inline, and the frontend expands a row into the exact
  // same NextBestActionPanel every other surface uses, scoped to that recipient's real
  // recordId -- not a bespoke summary-only substitute. The tenant-wide aggregate
  // (recipientsWithPendingNba/sampledLeadCount) stays too, for an at-a-glance read before
  // expanding anything.
  const sample = records.items.slice(0, 10);
  const leadIds = records.items.filter((item: any) => item.entityType === "LEAD").map((item: any) => String(item.entityId));
  const pendingNbaMap = leadIds.length ? await getPendingNbaCountMap(user.tenantId, leadIds) : new Map<string, number>();
  const recipientsWithPendingNba = leadIds.filter((id: string) => (pendingNbaMap.get(id) ?? 0) > 0).length;
  const sampleWithNba = sample.map((item: any) =>
    item.entityType === "LEAD" ? { ...item, pendingNbaCount: pendingNbaMap.get(String(item.entityId)) ?? 0 } : item,
  );

  return { count: records.total, sample: sampleWithNba, recipientsWithPendingNba, sampledLeadCount: leadIds.length };
}

export async function sendMarketingCampaignTestForTenant(user: TenantUser, id: string, recipient: string) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "MARKETING", { isPlatformAdmin: user.isPlatformAdmin });
  const campaign = await getMarketingCampaignForTenant(user, id);
  if (!campaign) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
  await assertTemplatesSendableForTenant(tenantId, [campaign.templateId]);
  const queued = await queueCommunicationForTenant(user, {
    channel: campaign.channel,
    recipient,
    subject: renderTemplate(await expandSnippetsForTenant(tenantId, campaign.subject ?? ""), { test: true }),
    body: renderTemplate(await expandSnippetsForTenant(tenantId, campaign.body ?? ""), { test: true, name: "Test Recipient" }),
    templateId: campaign.templateId,
    providerConfigId: campaign.providerConfigId,
    senderIdentityId: campaign.senderIdentityId,
    sourceType: "MARKETING_CAMPAIGN_TEST",
    sourceId: campaign.id,
    payload: { campaignId: campaign.id, test: true },
  });
  return queued;
}

// Launching queues every recipient in the audience (§8 #24: it used to stop at 500, 1,000 or
// 5,000 and still mark the campaign Completed). The audience is read in batches in lead-id order:
// what fits in this request is queued now, and the worker carries on from where it stopped
// (processDueCampaignLaunches) until the campaign is Completed. Someone already queued for this
// campaign is never queued twice, so a retried or continued run can't double-send.
const LAUNCH_BATCH = 200;
const LAUNCH_LEASE_MS = 2 * 60_000;

type LaunchState = {
  startedBy: string;
  startedAt: string;
  total: number;
  queued: number;
  afterId: string | null;
  done: boolean;
  leaseUntil?: string | null;
  completedAt?: string | null;
};

export async function launchMarketingCampaignForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  await assertModuleEnabled(tenantId, "MARKETING", { isPlatformAdmin: user.isPlatformAdmin });
  const campaign = await getMarketingCampaignForTenant(user, id);
  if (!campaign) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
  if (!["APPROVED", "SCHEDULED", "RUNNING"].includes(campaign.status)) {
    throw new Error("CAMPAIGN_MUST_BE_APPROVED_BEFORE_LAUNCH");
  }
  await assertTemplatesSendableForTenant(tenantId, [campaign.templateId, ...(campaign.steps ?? []).map((step: any) => step.templateId)]);
  // The audience first: if it can't be worked out, the campaign isn't marked running.
  const audience = await campaignAudience(user, campaign.audienceType, campaign.audienceConfig ?? {}, campaign.channel);
  const total = await countCampaignAudience(user, audience);
  const current = campaign.launchState as LaunchState | null;
  // A launch that is still going carries on; otherwise this starts one.
  if (campaign.status !== "RUNNING" || !current || current.done) {
    await updateMarketingCampaignStatusForTenant(user, id, "RUNNING");
    const state: LaunchState = { startedBy: user.id, startedAt: new Date().toISOString(), total, queued: 0, afterId: null, done: false, leaseUntil: null };
    await query(`update "MarketingCampaign" set "launchState" = $3 where "tenantId" = $1 and id = $2`, [tenantId, id, state]);
  }
  const run = await continueCampaignLaunch(user, id, { timeBudgetMs: 20_000 });
  const stats = await campaignStats(tenantId, [id]);
  return { queued: run.queued, totalAudience: total, inProgress: !run.done, stats: stats.get(id) ?? defaultStats() };
}

// Queues the next batches of a running launch, for up to `timeBudgetMs`. Only one run at a time
// (a lease on the campaign row); stops if the campaign is paused or cancelled meanwhile.
async function continueCampaignLaunch(user: TenantUser, id: string, options: { timeBudgetMs: number }) {
  const tenantId = requireTenantId(user);
  const startedAt = Date.now();
  const lease = async () => queryOne<{ launchState: LaunchState }>(
    `update "MarketingCampaign"
     set "launchState" = jsonb_set("launchState", '{leaseUntil}', to_jsonb($3::text))
     where "tenantId" = $1 and id = $2 and status = 'RUNNING' and "launchState" is not null
       and ("launchState"->>'done') = 'false'
       and (coalesce("launchState"->>'leaseUntil', '') = '' or ("launchState"->>'leaseUntil')::timestamptz < now())
     returning "launchState"`,
    [tenantId, id, new Date(Date.now() + LAUNCH_LEASE_MS).toISOString()],
  );
  const claimed = await lease();
  if (!claimed) return { queued: 0, done: false };
  let state = claimed.launchState;

  const campaign = await getMarketingCampaignForTenant(user, id);
  if (!campaign) return { queued: 0, done: false };
  const audience = await campaignAudience(user, campaign.audienceType, campaign.audienceConfig ?? {}, campaign.channel);
  // Snippets expand once in the campaign's own text, before each recipient's values are filled in.
  const campaignSubject = await expandSnippetsForTenant(tenantId, campaign.subject ?? "");
  const campaignBody = await expandSnippetsForTenant(tenantId, campaign.body ?? "");
  const stepText = new Map<unknown, { subject: string | null; body: string | null }>();
  for (const step of campaign.steps ?? []) {
    stepText.set(step, {
      subject: step.subject == null ? null : await expandSnippetsForTenant(tenantId, step.subject),
      body: step.body ? await expandSnippetsForTenant(tenantId, step.body) : null,
    });
  }

  let queuedThisRun = 0;
  let done = false;
  try {
    while (true) {
      const batch = await campaignAudienceBatch(user, audience, campaign.channel, state.afterId, LAUNCH_BATCH);
      if (!batch.items.length && !batch.lastId) {
        done = true;
        break;
      }
      // Already queued for this campaign (an earlier, interrupted run): skip.
      const already = new Set((await query<{ entityId: string }>(
        `select distinct "entityId" from "MarketingCampaignRecipient" where "tenantId" = $1 and "campaignId" = $2 and "entityId" = any($3::text[])`,
        [tenantId, id, batch.items.map((item: any) => String(item.entityId))],
      )).map((row) => row.entityId));
      const now = new Date();
      let queued = 0;
      for (const item of batch.items) {
        if (already.has(String(item.entityId))) continue;
        const tokens = leadTokens(item.record, campaign.tokens ?? {});
        const steps = campaign.campaignType === "DRIP" && campaign.steps?.length
          ? campaign.steps
          : [{ stepOrder: 1, delayMinutes: 0, channel: campaign.channel, templateId: campaign.templateId, subject: null, body: null }];
        for (const step of steps) {
          const stepChannel = normalizeChannel(step.channel || campaign.channel);
          const outbox = await queueCommunicationForTenant(user, {
            channel: stepChannel,
            recipient: item.recipient,
            subject: renderTemplate(stepText.get(step)?.subject ?? campaignSubject, tokens),
            body: renderTemplate(stepText.get(step)?.body || campaignBody, tokens),
            templateId: step.templateId || campaign.templateId,
            providerConfigId: campaign.providerConfigId,
            senderIdentityId: campaign.senderIdentityId,
            sourceType: "MARKETING_CAMPAIGN",
            sourceId: campaign.id,
            entityType: item.entityType,
            entityId: item.entityId,
            payload: { campaignId: campaign.id, stepOrder: step.stepOrder ?? 1, utmDefaults: campaign.utmDefaults ?? {} },
          });
          const nextAttemptAt = new Date(now.getTime() + Math.max(0, Number(step.delayMinutes ?? 0)) * 60000).toISOString();
          await query('update "CommunicationOutbox" set "nextAttemptAt" = $1, "updatedAt" = $1 where id = $2', [nextAttemptAt, outbox.id]);
          await query(
            `insert into "MarketingCampaignRecipient"
              (id, "tenantId", "campaignId", "entityType", "entityId", recipient, status, "outboxId", metadata, "createdAt", "updatedAt")
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
             returning id`,
            [
              randomUUID(),
              tenantId,
              campaign.id,
              item.entityType,
              item.entityId,
              item.recipient,
              outbox.status === "SUPPRESSED" ? "SUPPRESSED" : "QUEUED",
              outbox.id,
              { queuedAt: now.toISOString(), stepOrder: step.stepOrder ?? 1, delayMinutes: step.delayMinutes ?? 0 },
              now.toISOString(),
            ],
          );
          queued += 1;
        }
      }
      queuedThisRun += queued;
      state = { ...state, queued: state.queued + queued, afterId: batch.lastId, leaseUntil: new Date(Date.now() + LAUNCH_LEASE_MS).toISOString() };
      const saved = await queryOne<{ id: string }>(
        `update "MarketingCampaign" set "launchState" = $3, "updatedAt" = now() where "tenantId" = $1 and id = $2 and status = 'RUNNING' returning id`,
        [tenantId, id, state],
      );
      // Paused or cancelled meanwhile: stop here.
      if (!saved) return { queued: queuedThisRun, done: false };
      if (!batch.lastId) {
        done = true;
        break;
      }
      if (Date.now() - startedAt > options.timeBudgetMs) break;
    }
  } catch (error) {
    // Kept for the campaign page; the lease runs out and the worker tries again.
    await query(
      `update "MarketingCampaign" set "launchState" = "launchState" || $3::jsonb where "tenantId" = $1 and id = $2`,
      [tenantId, id, { lastError: error instanceof Error ? error.message : String(error), lastErrorAt: new Date().toISOString() }],
    ).catch(() => undefined);
    throw error;
  }

  if (done) {
    await query(`update "MarketingCampaign" set "launchState" = $3 where "tenantId" = $1 and id = $2`, [tenantId, id, { ...state, done: true, leaseUntil: null, completedAt: new Date().toISOString() }]);
    await updateMarketingCampaignStatusForTenant(user, id, "COMPLETED");
  } else {
    await query(`update "MarketingCampaign" set "launchState" = jsonb_set("launchState", '{leaseUntil}', 'null'::jsonb) where "tenantId" = $1 and id = $2`, [tenantId, id]);
  }
  return { queued: queuedThisRun, done };
}

// Worker: carries on launches that didn't finish in their request, as the person who launched.
export async function processDueCampaignLaunches(limit = 5, timeBudgetMs = 45_000) {
  const due = await queryAsSystem<{ id: string; tenantId: string; startedBy: string }>(
    `select id, "tenantId", "launchState"->>'startedBy' as "startedBy"
     from "MarketingCampaign"
     where status = 'RUNNING' and ("launchState"->>'done') = 'false'
       and (coalesce("launchState"->>'leaseUntil', '') = '' or ("launchState"->>'leaseUntil')::timestamptz < now())
     order by "updatedAt" asc
     limit $1`,
    [limit],
  );
  let processed = 0;
  for (const row of due) {
    const launcher = await getCurrentUserById(row.startedBy);
    if (!launcher || launcher.tenantId !== row.tenantId) continue;
    await continueCampaignLaunch(launcher as TenantUser, row.id, { timeBudgetMs }).catch((error) => {
      console.error("Campaign launch batch failed", { campaignId: row.id, error: error instanceof Error ? error.message : String(error) });
    });
    processed += 1;
  }
  return { processed };
}

type CampaignAudience =
  | { kind: "manual"; items: Array<{ entityType: string; entityId: string; recipient: string; record: Record<string, unknown> }> }
  | { kind: "leads"; query: LeadAudienceQuery }
  | { kind: "none" };

// Who a campaign goes to. Manual recipients are listed in the campaign; a lead list or saved view
// is read in batches (campaignAudienceBatch), all of it.
async function campaignAudience(user: TenantUser, audienceType: AudienceType, audienceConfig: Record<string, any>, channel: Channel): Promise<CampaignAudience> {
  if (audienceType === "MANUAL") {
    const recipients = Array.isArray(audienceConfig.recipients) ? audienceConfig.recipients : [];
    const items = recipients
      .map((recipient, index) => normalizeRecipient(channel, recipient) ? ({
        entityType: "MANUAL",
        entityId: `manual-${index + 1}`,
        recipient: normalizeRecipient(channel, recipient)!,
        record: { name: "Manual Recipient" },
      }) : null)
      .filter(Boolean) as any[];
    return { kind: "manual", items };
  }

  if (audienceType === "LEAD_LIST" && audienceConfig.leadListId) {
    const listQuery = await leadAudienceForList(user, String(audienceConfig.leadListId));
    return listQuery ? { kind: "leads", query: listQuery } : { kind: "none" };
  }

  if (audienceType === "SAVED_VIEW" && audienceConfig.savedViewId) {
    const view = await queryOne<any>(
      `select config
       from "CustomReport"
       where "tenantId" = $1 and id = $2 and "chartType" = 'SAVED_VIEW' and "deletedAt" is null
       limit 1`,
      [requireTenantId(user), String(audienceConfig.savedViewId)],
    );
    // A view that's gone or archived used to fall through to "no filters", i.e. every lead.
    if (!view) throw new Error("AUDIENCE_VIEW_NOT_FOUND");
    const tabs = Array.isArray(view?.config?.tabs) ? view.config.tabs : [];
    // Only the view's leads tab; another module's filters don't apply to leads.
    const leadTab = tabs.find((tab: any) => String(tab.module).toUpperCase() === "LEADS");
    if (!leadTab) return { kind: "none" };
    // The view's filters exactly as the Smart View applies them, and strict: a condition the
    // server can't apply stops the send instead of being skipped (which would message more
    // people than the view shows).
    const translated = toServerQuery("LEADS", leadTab.filters);
    if (!translated.ok) throw Object.assign(new Error("AUDIENCE_FILTER_UNSUPPORTED"), { field: translated.field });
    return { kind: "leads", query: { filters: translated.group ? [translated.group] as any : null, strictFilters: true } };
  }

  return { kind: "none" };
}

async function countCampaignAudience(user: TenantUser, audience: CampaignAudience) {
  if (audience.kind === "manual") return audience.items.length;
  if (audience.kind === "leads") return countLeadAudienceForTenant(user, audience.query);
  return 0;
}

// The next batch after `afterId` (leads in id order; manual recipients all at once). `lastId` is
// null once there is nothing after this batch. Leads with no address for the channel are skipped.
async function campaignAudienceBatch(user: TenantUser, audience: CampaignAudience, channel: Channel, afterId: string | null, limit: number) {
  if (audience.kind === "manual") return { items: afterId ? [] : audience.items, lastId: null as string | null };
  if (audience.kind !== "leads") return { items: [] as any[], lastId: null as string | null };
  const leads = await listLeadAudiencePageForTenant(user, audience.query, afterId, limit);
  const items = leadsToRecipients(leads, channel, leads.length, leads.length).items;
  return { items, lastId: leads.length === limit ? String(leads[leads.length - 1].id) : null };
}

// The audience size and a sample (the audience preview).
async function resolveAudience(user: TenantUser, audienceType: AudienceType, audienceConfig: Record<string, any>, channel: Channel, limit: number) {
  const audience = await campaignAudience(user, audienceType, audienceConfig, channel);
  const total = await countCampaignAudience(user, audience);
  const batch = await campaignAudienceBatch(user, audience, channel, null, limit);
  return { total, items: batch.items.slice(0, limit) };
}

function leadsToRecipients(leads: any[], channel: Channel, limit: number, total: number) {
  const field = recipientFieldForChannel(channel);
  const items = leads
    .map((lead) => {
      const recipient = normalizeRecipient(channel, lead[field]);
      if (!recipient) return null;
      return { entityType: "LEAD", entityId: lead.id, recipient, record: lead };
    })
    .filter(Boolean) as any[];
  return { total, items: items.slice(0, limit) };
}
