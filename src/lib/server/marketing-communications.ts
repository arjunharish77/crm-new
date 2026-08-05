import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { getLeadListForTenant } from "@/lib/repositories/lead-lists-postgres";
import { listLeadsForTenant } from "@/lib/repositories/leads-postgres";
import { queueCommunicationForTenant, renderTemplate } from "@/lib/server/communications";

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
  "throttlePerMinute", "quietHours", "scheduledAt", "approvedBy", "approvedAt", "createdBy", "updatedBy", "createdAt", "updatedAt"`;

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
  const now = new Date().toISOString();
  const id = input.id || randomUUID();
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("CAMPAIGN_NAME_REQUIRED");
  const channel = normalizeChannel(input.channel);
  const body = String(input.body ?? "").trim();
  const campaignType = input.campaignType === "DRIP" ? "DRIP" : "BROADCAST";
  if (!body && campaignType === "BROADCAST" && !input.templateId) throw new Error("CAMPAIGN_BODY_OR_TEMPLATE_REQUIRED");

  const before = input.id ? await getMarketingCampaignForTenant(user, input.id) : null;
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
  const after = await getMarketingCampaignForTenant(user, row.id);
  await createAuditLog(user as any, before ? "UPDATE" : "CREATE", "MARKETING_CAMPAIGN", row.id, before, after, { channel }).catch(() => undefined);
  return after;
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

export async function updateMarketingCampaignStatusForTenant(user: TenantUser, id: string, status: CampaignStatus) {
  const tenantId = requireTenantId(user);
  const before = await getMarketingCampaignForTenant(user, id);
  if (!before) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
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
  const channel = normalizeChannel(input.channel);
  const records = await resolveAudience(user, normalizeAudienceType(input.audienceType), input.audienceConfig ?? {}, channel, 100);
  return { count: records.total, sample: records.items.slice(0, 10) };
}

export async function sendMarketingCampaignTestForTenant(user: TenantUser, id: string, recipient: string) {
  const campaign = await getMarketingCampaignForTenant(user, id);
  if (!campaign) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
  const queued = await queueCommunicationForTenant(user, {
    channel: campaign.channel,
    recipient,
    subject: renderTemplate(campaign.subject ?? "", { test: true }),
    body: renderTemplate(campaign.body, { test: true, name: "Test Recipient" }),
    templateId: campaign.templateId,
    providerConfigId: campaign.providerConfigId,
    senderIdentityId: campaign.senderIdentityId,
    sourceType: "MARKETING_CAMPAIGN_TEST",
    sourceId: campaign.id,
    payload: { campaignId: campaign.id, test: true },
  });
  return queued;
}

export async function launchMarketingCampaignForTenant(user: TenantUser, id: string) {
  const tenantId = requireTenantId(user);
  const campaign = await getMarketingCampaignForTenant(user, id);
  if (!campaign) throw new Error("MARKETING_CAMPAIGN_NOT_FOUND");
  if (!["APPROVED", "SCHEDULED", "RUNNING"].includes(campaign.status)) {
    throw new Error("CAMPAIGN_MUST_BE_APPROVED_BEFORE_LAUNCH");
  }
  await updateMarketingCampaignStatusForTenant(user, id, "RUNNING");
  const audience = await resolveAudience(user, campaign.audienceType, campaign.audienceConfig ?? {}, campaign.channel, 5000);
  const now = new Date();
  let queued = 0;
  for (const item of audience.items) {
    const tokens = leadTokens(item.record, campaign.tokens ?? {});
    const steps = campaign.campaignType === "DRIP" && campaign.steps?.length
      ? campaign.steps
      : [{ stepOrder: 1, delayMinutes: 0, channel: campaign.channel, templateId: campaign.templateId, subject: campaign.subject, body: campaign.body }];
    for (const step of steps) {
      const stepChannel = normalizeChannel(step.channel || campaign.channel);
      const outbox = await queueCommunicationForTenant(user, {
        channel: stepChannel,
        recipient: item.recipient,
        subject: renderTemplate(step.subject ?? campaign.subject ?? "", tokens),
        body: renderTemplate(step.body || campaign.body, tokens),
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
  await updateMarketingCampaignStatusForTenant(user, id, "COMPLETED");
  const stats = await campaignStats(tenantId, [id]);
  return { queued, totalAudience: audience.total, stats: stats.get(id) ?? defaultStats() };
}

async function resolveAudience(user: TenantUser, audienceType: AudienceType, audienceConfig: Record<string, any>, channel: Channel, limit: number) {
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
    return { total: items.length, items: items.slice(0, limit) };
  }

  if (audienceType === "LEAD_LIST" && audienceConfig.leadListId) {
    const list = await getLeadListForTenant(user, String(audienceConfig.leadListId));
    const leads = Array.isArray(list?.leads) ? list.leads : [];
    return leadsToRecipients(leads, channel, limit, Number(list?.count ?? leads.length));
  }

  if (audienceType === "SAVED_VIEW" && audienceConfig.savedViewId) {
    const view = await queryOne<any>(
      `select config
       from "CustomReport"
       where "tenantId" = $1 and id = $2 and "chartType" = 'SAVED_VIEW'
       limit 1`,
      [requireTenantId(user), String(audienceConfig.savedViewId)],
    );
    const tabs = Array.isArray(view?.config?.tabs) ? view.config.tabs : [];
    const leadTab = tabs.find((tab: any) => String(tab.module).toUpperCase() === "LEADS") ?? tabs[0];
    const filters = leadTab?.filters ? [{ logic: leadTab.filters.logic ?? "AND", conditions: leadTab.filters.conditions ?? [] }] : null;
    const result = await listLeadsForTenant(user, 1, limit, filters as any);
    return leadsToRecipients(result.data, channel, limit, result.meta.total);
  }

  return { total: 0, items: [] as any[] };
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
