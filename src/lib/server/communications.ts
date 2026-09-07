import { randomUUID } from "crypto";
import net from "net";
import tls from "tls";
import { query, queryOne, execute, type Queryable } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { refreshNextBestActionsForRecord } from "@/lib/server/next-best-action";
import { enqueueWebhookEvent } from "@/lib/server/webhook-outbox";
import { enqueueAppEvent } from "@/lib/server/marketplace-events";

type TenantUser = {
  id: string;
  tenantId: string | null;
  email?: string | null;
};

type Channel = "EMAIL" | "WHATSAPP" | "SMS";

type ProviderInput = {
  id?: string;
  channel: Channel;
  providerType: "SMTP" | "GENERIC_HTTP";
  name: string;
  config?: Record<string, unknown>;
  secretConfig?: Record<string, unknown>;
  isActive?: boolean;
};

type TemplateInput = {
  id?: string;
  channel: Channel;
  name: string;
  subject?: string | null;
  body: string;
  tokens?: string[];
  metadata?: Record<string, unknown>;
  isActive?: boolean;
};

type SenderIdentityInput = {
  id?: string;
  channel: Channel;
  name: string;
  address: string;
  providerConfigId?: string | null;
  isDefault?: boolean;
  isVerified?: boolean;
  metadata?: Record<string, unknown>;
};

type LawfulBasis = "CONSENT" | "CONTRACT" | "LEGITIMATE_INTEREST" | "LEGAL_OBLIGATION";

type ConsentInput = {
  entityType: string;
  entityId: string;
  channel: Channel;
  status: "OPTED_IN" | "OPTED_OUT";
  source?: string | null;
  lawfulBasis?: LawfulBasis | null;
};

type SuppressionInput = {
  channel: Channel;
  address: string;
  reason?: string | null;
  expiresAt?: string | null;
};

type OutboxInput = {
  channel: Channel;
  recipient: string;
  subject?: string | null;
  body?: string | null;
  templateId?: string | null;
  tokens?: Record<string, unknown>;
  providerConfigId?: string | null;
  senderIdentityId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  // Journey channel-fallback (gap checklist Module 8, item 8): when the primary send is blocked
  // (suppressed/opted-out/fatigue-capped) or later exhausts its retries and reaches FAILED, a
  // fallback send is queued on `fallback.channel` to `fallback.recipient` -- never chained
  // further (a fallback send never carries its own `fallback`). `delayMinutes` only applies to
  // the FAILED-triggered path (processCommunicationOutbox); the blocked-at-enqueue path sends
  // the fallback immediately, since there's nothing left to wait on.
  fallback?: {
    channel: Channel;
    recipient: string;
    subject?: string | null;
    body: string;
    delayMinutes?: number;
    // false = only fire from the delayed, FAILED-branch path (processCommunicationOutbox)
    // once retries are exhausted, never immediately just because the primary send was
    // blocked at enqueue time (suppressed/fatigue-capped/excluded). Defaults to true.
    immediate?: boolean;
  } | null;
  // Per-node throttle/quiet-hours (item 8's "per-channel throttle rules"), embedded directly on
  // the outbox row rather than looked up by sourceId the way MarketingCampaign's own
  // throttle/quietHours already are -- a journey step has no single canonical "campaign row" to
  // look these up from, so the caller (the send_email automation node) resolves and passes them
  // through directly. `throttleKey` scopes the rolling-window send count (e.g. `${automationId}:${nodeId}`).
  deliveryControls?: { throttlePerMinute?: number | null; quietHours?: Record<string, unknown> | null; throttleKey?: string | null } | null;
  // Explicit schedule override, used by the FAILED-triggered fallback path to honor
  // `fallback.delayMinutes` -- defaults to "now" (the existing behavior) when omitted.
  scheduledAt?: string | null;
};

type DeliveryControls = {
  throttlePerMinute: number;
  quietHours: Record<string, unknown>;
};

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function normalizeChannel(channel: unknown): Channel {
  const value = String(channel ?? "").toUpperCase();
  if (value === "EMAIL" || value === "WHATSAPP" || value === "SMS") return value;
  throw new Error("INVALID_COMMUNICATION_CHANNEL");
}

function normalizeAddress(channel: Channel, address: string) {
  const value = String(address ?? "").trim();
  if (!value) throw new Error("RECIPIENT_REQUIRED");
  return channel === "EMAIL" ? value.toLowerCase() : value.replace(/\s+/g, "");
}

function redactProvider(row: any) {
  const secretKeys = Object.keys(row.secretConfig ?? {});
  return { ...row, secretConfig: secretKeys.length ? Object.fromEntries(secretKeys.map((key) => [key, "********"])) : {} };
}

function extractTokens(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]))];
}

export function renderTemplate(text: string, tokens: Record<string, unknown> = {}, tokenDefaults: Record<string, unknown> = {}) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = tokens[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
    return String(tokenDefaults[key] ?? "");
  });
}

export async function listCommunicationProvidersForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const rows = await query<any>(
    `select id, "tenantId", channel, "providerType", name, config, "secretConfig", "isActive", "createdAt", "updatedAt"
     from "CommunicationProviderConfig"
     where "tenantId" = $1
     order by channel asc, name asc`,
    [tenantId],
  );
  return rows.map(redactProvider);
}

export async function upsertCommunicationProviderForTenant(user: TenantUser, input: ProviderInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const providerType = input.providerType === "SMTP" ? "SMTP" : "GENERIC_HTTP";
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("PROVIDER_NAME_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationProviderConfig"
      (id, "tenantId", channel, "providerType", name, config, "secretConfig", "isActive", "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $10)
     on conflict ("tenantId", channel, name) do update set
       "providerType" = excluded."providerType",
       config = excluded.config,
       "secretConfig" = case
         when excluded."secretConfig" = '{}'::jsonb then "CommunicationProviderConfig"."secretConfig"
         else excluded."secretConfig"
       end,
       "isActive" = excluded."isActive",
       "updatedBy" = excluded."updatedBy",
       "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", channel, "providerType", name, config, "secretConfig", "isActive", "createdAt", "updatedAt"`,
    [
      input.id || randomUUID(),
      tenantId,
      channel,
      providerType,
      name,
      input.config ?? {},
      input.secretConfig ?? {},
      input.isActive !== false,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("COMMUNICATION_PROVIDER_UPSERT_FAILED");
  await createAuditLog(user as any, "UPDATE", "COMMUNICATION_PROVIDER", row.id, null, redactProvider(row), { channel }).catch(() => undefined);
  return redactProvider(row);
}

const TEMPLATE_COLUMNS = `id, "tenantId", channel, name, subject, body, tokens, metadata, version, locale, "approvalStatus",
  "declaredTokens", "tokenDefaults", "lockedHeader", "lockedFooter", "approvedBy", "approvedAt", "isActive", "createdAt", "updatedAt"`;

// "Current" = the highest-numbered isActive row per (channel, name, locale) -- editing a
// template inserts a new version rather than overwriting (Module 8 item 12), matching the
// AiPromptTemplate/KnowledgeBaseArticle versioning precedent used elsewhere this session.
export async function listCommunicationTemplatesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select distinct on (channel, name, locale) ${TEMPLATE_COLUMNS}
     from "CommunicationTemplate"
     where "tenantId" = $1 and "isActive" = true
     order by channel asc, name asc, locale asc, version desc`,
    [tenantId],
  );
}

export async function listCommunicationTemplateVersionsForTenant(user: TenantUser, channel: Channel, name: string, locale = "en") {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select ${TEMPLATE_COLUMNS} from "CommunicationTemplate"
     where "tenantId" = $1 and channel = $2 and name = $3 and locale = $4
     order by version desc`,
    [tenantId, normalizeChannel(channel), name, locale],
  );
}

export async function listSenderIdentitiesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, "tenantId", channel, name, address, "providerConfigId", "isDefault", "isVerified", metadata, "createdAt", "updatedAt"
     from "SenderIdentity"
     where "tenantId" = $1
     order by channel asc, "isDefault" desc, name asc`,
    [tenantId],
  );
}

export async function upsertSenderIdentityForTenant(user: TenantUser, input: SenderIdentityInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const name = String(input.name ?? "").trim();
  const address = normalizeAddress(channel, input.address);
  if (!name) throw new Error("SENDER_IDENTITY_NAME_REQUIRED");
  const now = new Date().toISOString();
  const id = input.id || randomUUID();
  if (input.isDefault !== false) {
    await query(
      `update "SenderIdentity"
       set "isDefault" = false, "updatedAt" = $1
       where "tenantId" = $2 and channel = $3`,
      [now, tenantId, channel],
    );
  }
  const existing = await queryOne<any>(
    `select id
     from "SenderIdentity"
     where "tenantId" = $1 and channel = $2 and address = $3
     limit 1`,
    [tenantId, channel, address],
  );
  const row = await queryOne<any>(
    `insert into "SenderIdentity"
      (id, "tenantId", channel, name, address, "providerConfigId", "isDefault", "isVerified", metadata, "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     on conflict (id) do update set
       name = excluded.name,
       address = excluded.address,
       "providerConfigId" = excluded."providerConfigId",
       "isDefault" = excluded."isDefault",
       "isVerified" = excluded."isVerified",
       metadata = excluded.metadata,
       "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", channel, name, address, "providerConfigId", "isDefault", "isVerified", metadata, "createdAt", "updatedAt"`,
    [
      existing?.id ?? id,
      tenantId,
      channel,
      name,
      address,
      input.providerConfigId || null,
      input.isDefault !== false,
      input.isVerified === true,
      input.metadata ?? {},
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("SENDER_IDENTITY_UPSERT_FAILED");
  await createAuditLog(user as any, "UPDATE", "SENDER_IDENTITY", row.id, null, row, { channel }).catch(() => undefined);
  return row;
}

export async function listCommunicationSuppressionsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, "tenantId", channel, address, reason, "createdAt"
     from "CommunicationSuppression"
     where "tenantId" = $1
     order by "createdAt" desc
     limit 500`,
    [tenantId],
  );
}

export async function upsertCommunicationConsentForTenant(user: TenantUser, input: ConsentInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const entityType = String(input.entityType ?? "").trim().toUpperCase();
  const entityId = String(input.entityId ?? "").trim();
  if (!entityType || !entityId) throw new Error("CONSENT_ENTITY_REQUIRED");
  const status = input.status === "OPTED_OUT" ? "OPTED_OUT" : "OPTED_IN";
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationConsent"
      (id, "tenantId", "entityType", "entityId", channel, status, source, "lawfulBasis", "capturedAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     on conflict ("tenantId", "entityType", "entityId", channel) do update set
       status = excluded.status,
       source = excluded.source,
       "lawfulBasis" = excluded."lawfulBasis",
       "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", "entityType", "entityId", channel, status, source, "lawfulBasis", "capturedAt", "updatedAt"`,
    [randomUUID(), tenantId, entityType, entityId, channel, status, input.source || "MANUAL", input.lawfulBasis || null, now],
  );
  if (!row) throw new Error("COMMUNICATION_CONSENT_UPSERT_FAILED");
  // CommunicationConsent itself is upsert-only (one row per tenant+entity+channel, prior
  // state overwritten) -- this is the real, append-only "channel consent history" the
  // checklist names, independent of whatever AuditLog happens to retain generically.
  await execute(
    `insert into "CommunicationConsentHistory" (id, "tenantId", "entityType", "entityId", channel, status, "lawfulBasis", source, "changedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [randomUUID(), tenantId, entityType, entityId, channel, status, input.lawfulBasis || null, input.source || "MANUAL", user.id, now],
  );
  await createAuditLog(user as any, "UPDATE", "COMMUNICATION_CONSENT", row.id, null, row, { channel, entityType, entityId }).catch(() => undefined);
  return row;
}

export async function listConsentHistoryForTenant(user: TenantUser, entityType: string, entityId: string) {
  const tenantId = requireTenantId(user);
  return query(
    `select id, channel, status, "lawfulBasis", source, "changedBy", "createdAt"
     from "CommunicationConsentHistory"
     where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3
     order by "createdAt" desc`,
    [tenantId, entityType.toUpperCase(), entityId],
  );
}

export async function suppressCommunicationAddressForTenant(user: TenantUser, input: SuppressionInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const address = normalizeAddress(channel, input.address);
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationSuppression" (id, "tenantId", channel, address, reason, "expiresAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict ("tenantId", channel, address) do update set reason = excluded.reason, "expiresAt" = excluded."expiresAt"
     returning id, "tenantId", channel, address, reason, "expiresAt", "createdAt"`,
    [randomUUID(), tenantId, channel, address, input.reason || "MANUAL", input.expiresAt || null, now],
  );
  if (!row) throw new Error("COMMUNICATION_SUPPRESSION_UPSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "COMMUNICATION_SUPPRESSION", row.id, null, row, { channel }).catch(() => undefined);
  return row;
}

// Worker job (communications.processSuppressionExpiry) -- modeled directly on
// processExpiredExportFiles/expireCallRecordings' exact shape. Suppressions created with no
// expiresAt (the default -- a hard bounce or explicit legal hold) are permanent and untouched;
// only ones an admin explicitly time-boxed are ever removed.
export async function processDueSuppressionExpiry(limit = 100) {
  const processed = await execute(
    `delete from "CommunicationSuppression"
     where id = any(
       select id from "CommunicationSuppression" where "expiresAt" is not null and "expiresAt" <= $1 limit $2
     )`,
    [new Date().toISOString(), limit],
  );
  return { processed };
}

type TemplateGovernanceInput = TemplateInput & {
  locale?: string;
  declaredTokens?: string[];
  tokenDefaults?: Record<string, string>;
  lockedHeader?: string | null;
  lockedFooter?: string | null;
};

function findUndeclaredTokens(text: string, declaredTokens: string[]): string[] {
  return extractTokens(text).filter((token) => !declaredTokens.includes(token));
}

// Deliberately does NOT reuse the `PrivilegedActionRequest` approval primitive (used 3x
// elsewhere this session for reassignment/AI-send/case-macro-reply): template approval is a
// content-review gate, not a specific mutating action needing distinct-approver enforcement or
// undo semantics, so it follows the simpler `MarketingCampaign.status`-style plain status flip
// instead. Every edit resets to DRAFT -- a previously APPROVED template must be re-approved
// after any change, which is the entire point of a governance gate.
export async function upsertCommunicationTemplateForTenant(user: TenantUser, input: TemplateGovernanceInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const name = String(input.name ?? "").trim();
  if (!name || !input.body?.trim()) throw new Error("TEMPLATE_NAME_BODY_REQUIRED");
  const locale = String(input.locale ?? "en").trim() || "en";
  const tokens = input.tokens?.length ? input.tokens : extractTokens(`${input.subject ?? ""}\n${input.body}`);
  const declaredTokens = input.declaredTokens?.length ? input.declaredTokens : tokens;

  const existing = await queryOne<{ version: number }>(
    `select max(version) as version from "CommunicationTemplate" where "tenantId" = $1 and channel = $2 and name = $3 and locale = $4`,
    [tenantId, channel, name, locale],
  );
  const nextVersion = (existing?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationTemplate"
      (id, "tenantId", channel, name, subject, body, tokens, metadata, version, locale, "approvalStatus",
       "declaredTokens", "tokenDefaults", "lockedHeader", "lockedFooter", "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',$11,$12,$13,$14,$15,$16,$17,$17)
     returning ${TEMPLATE_COLUMNS}`,
    [
      randomUUID(),
      tenantId,
      channel,
      name,
      input.subject || null,
      input.body,
      tokens,
      input.metadata ?? {},
      nextVersion,
      locale,
      declaredTokens,
      input.tokenDefaults ?? {},
      input.lockedHeader || null,
      input.lockedFooter || null,
      input.isActive !== false,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("COMMUNICATION_TEMPLATE_UPSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "COMMUNICATION_TEMPLATE", row.id, null, { channel, name, version: nextVersion }, { channel, name }).catch(
    () => undefined,
  );
  return { ...row, tokenWarnings: findUndeclaredTokens(`${row.subject ?? ""}\n${row.body}`, declaredTokens) };
}

export async function setTemplateApprovalStatusForTenant(
  user: TenantUser,
  templateId: string,
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED",
) {
  const tenantId = requireTenantId(user);
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `update "CommunicationTemplate"
     set "approvalStatus" = $1,
         "approvedBy" = case when $1 = 'APPROVED' then $2 else "approvedBy" end,
         "approvedAt" = case when $1 = 'APPROVED' then $3::timestamptz else "approvedAt" end,
         "updatedAt" = $3
     where "tenantId" = $4 and id = $5
     returning ${TEMPLATE_COLUMNS}`,
    [status, user.id, now, tenantId, templateId],
  );
  if (!row) throw new Error("COMMUNICATION_TEMPLATE_NOT_FOUND");
  await createAuditLog(user as any, "UPDATE", "COMMUNICATION_TEMPLATE", row.id, null, { approvalStatus: status }, {}).catch(() => undefined);
  return row;
}

export async function listMarketingSnippetsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, "tenantId", key, body, "createdAt", "updatedAt" from "MarketingSnippet" where "tenantId" = $1 order by key asc`,
    [tenantId],
  );
}

export async function upsertMarketingSnippetForTenant(user: TenantUser, input: { id?: string; key: string; body: string }) {
  const tenantId = requireTenantId(user);
  const key = String(input.key ?? "").trim();
  if (!key || !input.body?.trim()) throw new Error("SNIPPET_KEY_BODY_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "MarketingSnippet" (id, "tenantId", key, body, "createdBy", "updatedBy", "createdAt", "updatedAt")
     values ($1,$2,$3,$4,$5,$5,$6,$6)
     on conflict ("tenantId", key) do update set body = excluded.body, "updatedBy" = excluded."updatedBy", "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", key, body, "createdAt", "updatedAt"`,
    [input.id || randomUUID(), tenantId, key, input.body, user.id, now],
  );
  if (!row) throw new Error("SNIPPET_UPSERT_FAILED");
  return row;
}

export async function deleteMarketingSnippetForTenant(user: TenantUser, snippetId: string) {
  const tenantId = requireTenantId(user);
  await execute(`delete from "MarketingSnippet" where "tenantId" = $1 and id = $2`, [tenantId, snippetId]);
}

async function substituteSnippets(tenantId: string, text: string, client?: Queryable): Promise<string> {
  const keys = [...new Set([...text.matchAll(/\{\{\s*snippet:([a-zA-Z0-9_.-]+)\s*\}\}/g)].map((match) => match[1]))];
  if (!keys.length) return text;
  const rows = await query<any>(`select key, body from "MarketingSnippet" where "tenantId" = $1 and key = any($2::text[])`, [tenantId, keys], client);
  const map = new Map(rows.map((r: any) => [r.key, r.body]));
  return text.replace(/\{\{\s*snippet:([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => map.get(key) ?? "");
}

// Locked header/footer (item 12) are appended around the rendered body at send time -- not
// stored merged into the template's own `body` -- so editing the locked section later doesn't
// require re-editing every template that uses it.
async function applyTemplateGovernance(tenantId: string, template: any, body: string, client?: Queryable): Promise<string> {
  let result = body;
  if (template.lockedHeader) result = `${template.lockedHeader}\n${result}`;
  if (template.lockedFooter) result = `${result}\n${template.lockedFooter}`;
  return substituteSnippets(tenantId, result, client);
}

export async function isSuppressed(tenantId: string, channel: Channel, recipient: string, client?: Queryable) {
  const row = await queryOne<any>(
    `select id from "CommunicationSuppression"
     where "tenantId" = $1 and channel = $2 and address = $3
     limit 1`,
    [tenantId, channel, recipient],
    client,
  );
  return !!row;
}

export async function isOptedOut(tenantId: string, channel: Channel, entityType?: string | null, entityId?: string | null, client?: Queryable) {
  if (!entityType || !entityId) return false;
  const row = await queryOne<any>(
    `select status from "CommunicationConsent"
     where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3 and channel = $4
     limit 1`,
    [tenantId, entityType, entityId, channel],
    client,
  );
  return row?.status === "OPTED_OUT";
}

// Contact fatigue governance (gap checklist Module 8, item 10). Both checks are scoped to
// marketing-originated sends only (queueCommunicationForTenant only calls these for
// sourceType MARKETING_CAMPAIGN/AUTOMATION) -- transactional/system communications sharing the
// same outbox (password resets, case replies, report deliveries) must never be capped or
// blackout-blocked.
async function checkExclusionWindow(tenantId: string, client?: Queryable): Promise<string | null> {
  const settings = await queryOne<any>(
    `select "exclusionWindows" from "MarketingFatigueSettings" where "tenantId" = $1`,
    [tenantId],
    client,
  );
  const windows: Array<{ startDate?: string; endDate?: string; reason?: string }> = settings?.exclusionWindows ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const active = windows.find((w) => w?.startDate && w?.endDate && w.startDate <= today && today <= w.endDate);
  return active ? active.reason || "EXCLUSION_WINDOW" : null;
}

async function checkFatigueCap(
  tenantId: string,
  channel: Channel,
  entityType?: string | null,
  entityId?: string | null,
  client?: Queryable,
): Promise<string | null> {
  if (!entityType || !entityId) return null;
  const settings = await queryOne<any>(
    `select "dailyCapPerContact", "weeklyCapPerContact", "monthlyCapPerContact", "channelCaps"
     from "MarketingFatigueSettings" where "tenantId" = $1`,
    [tenantId],
    client,
  );
  if (!settings) return null;
  const channelCap = Number((settings.channelCaps ?? {})[channel]);
  const checks: Array<{ label: string; sinceMs: number; cap: number | null; channelScoped?: boolean }> = [
    { label: "DAILY_CAP", sinceMs: 24 * 60 * 60 * 1000, cap: settings.dailyCapPerContact ? Number(settings.dailyCapPerContact) : null },
    { label: "WEEKLY_CAP", sinceMs: 7 * 24 * 60 * 60 * 1000, cap: settings.weeklyCapPerContact ? Number(settings.weeklyCapPerContact) : null },
    { label: "MONTHLY_CAP", sinceMs: 30 * 24 * 60 * 60 * 1000, cap: settings.monthlyCapPerContact ? Number(settings.monthlyCapPerContact) : null },
    {
      label: "CHANNEL_DAILY_CAP",
      sinceMs: 24 * 60 * 60 * 1000,
      cap: Number.isFinite(channelCap) && channelCap > 0 ? channelCap : null,
      channelScoped: true,
    },
  ];
  for (const check of checks) {
    if (!check.cap) continue;
    const since = new Date(Date.now() - check.sinceMs).toISOString();
    const row = await queryOne<{ count: number }>(
      `select count(*)::int as count
       from "CommunicationOutbox"
       where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3
         and "createdAt" >= $4
         and status <> 'SUPPRESSED'
         ${check.channelScoped ? `and channel = $5` : ""}`,
      check.channelScoped ? [tenantId, entityType, entityId, since, channel] : [tenantId, entityType, entityId, since],
      client,
    );
    if ((row?.count ?? 0) >= check.cap) return check.label;
  }
  return null;
}

export async function getFatigueSettingsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  const row = await queryOne<any>(`select * from "MarketingFatigueSettings" where "tenantId" = $1`, [tenantId]);
  return (
    row ?? {
      tenantId,
      dailyCapPerContact: null,
      weeklyCapPerContact: null,
      monthlyCapPerContact: null,
      channelCaps: {},
      exclusionWindows: [],
    }
  );
}

export async function upsertFatigueSettingsForTenant(
  user: TenantUser,
  input: {
    dailyCapPerContact?: number | null;
    weeklyCapPerContact?: number | null;
    monthlyCapPerContact?: number | null;
    channelCaps?: Record<string, number>;
    exclusionWindows?: Array<{ startDate: string; endDate: string; reason?: string }>;
  },
) {
  const tenantId = requireTenantId(user);
  const row = await queryOne<any>(
    `insert into "MarketingFatigueSettings"
      ("tenantId", "dailyCapPerContact", "weeklyCapPerContact", "monthlyCapPerContact", "channelCaps", "exclusionWindows", "updatedBy", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict ("tenantId") do update set
       "dailyCapPerContact" = excluded."dailyCapPerContact",
       "weeklyCapPerContact" = excluded."weeklyCapPerContact",
       "monthlyCapPerContact" = excluded."monthlyCapPerContact",
       "channelCaps" = excluded."channelCaps",
       "exclusionWindows" = excluded."exclusionWindows",
       "updatedBy" = excluded."updatedBy",
       "updatedAt" = now()
     returning *`,
    [
      tenantId,
      input.dailyCapPerContact ?? null,
      input.weeklyCapPerContact ?? null,
      input.monthlyCapPerContact ?? null,
      input.channelCaps ?? {},
      input.exclusionWindows ?? [],
      user.id,
    ],
  );
  if (!row) throw new Error("FATIGUE_SETTINGS_UPSERT_FAILED");
  await createAuditLog(user as any, "UPDATE", "MARKETING_FATIGUE_SETTINGS", tenantId, null, row, {}).catch(() => undefined);
  return row;
}

// PHONE deliberately kept out of the EMAIL/WHATSAPP/SMS `Channel` union above -- that type
// also gates CommunicationProviderConfig/CommunicationTemplate/the outbox pipeline, none of
// which have any PHONE-specific sending logic, so widening it there would let a "PHONE
// provider"/"PHONE template" be created that silently does nothing. These two functions reuse
// the exact same CommunicationSuppression/CommunicationConsent tables (their channel CHECK
// constraint was widened to include PHONE specifically for this reuse) without going through
// the shared Channel-typed API at all -- narrow, telephony-specific entry points instead of
// a broad type change with a real footgun.
export async function isPhoneSuppressed(tenantId: string, phoneNumber: string, client?: Queryable) {
  const row = await queryOne<any>(
    `select id from "CommunicationSuppression" where "tenantId" = $1 and channel = 'PHONE' and address = $2 limit 1`,
    [tenantId, phoneNumber],
    client,
  );
  return !!row;
}

export async function isPhoneOptedOut(tenantId: string, entityType?: string | null, entityId?: string | null, client?: Queryable) {
  if (!entityType || !entityId) return false;
  const row = await queryOne<any>(
    `select status from "CommunicationConsent" where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3 and channel = 'PHONE' limit 1`,
    [tenantId, entityType, entityId],
    client,
  );
  return row?.status === "OPTED_OUT";
}

export async function suppressPhoneNumberForTenant(user: TenantUser, phoneNumber: string, reason?: string | null) {
  const tenantId = requireTenantId(user);
  const address = String(phoneNumber ?? "").trim().replace(/\s+/g, "");
  if (!address) throw new Error("RECIPIENT_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationSuppression" (id, "tenantId", channel, address, reason, "createdAt")
     values ($1, $2, 'PHONE', $3, $4, $5)
     on conflict ("tenantId", channel, address) do update set reason = excluded.reason
     returning id, "tenantId", channel, address, reason, "createdAt"`,
    [randomUUID(), tenantId, address, reason || "MANUAL", now],
  );
  if (!row) throw new Error("COMMUNICATION_SUPPRESSION_UPSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "COMMUNICATION_SUPPRESSION", row.id, null, row, { channel: "PHONE" }).catch(() => undefined);
  return row;
}

export async function listPhoneSuppressionsForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, address, reason, "createdAt" from "CommunicationSuppression" where "tenantId" = $1 and channel = 'PHONE' order by "createdAt" desc limit 500`,
    [tenantId],
  );
}

export async function removePhoneSuppressionForTenant(user: TenantUser, suppressionId: string) {
  const tenantId = requireTenantId(user);
  await execute(`delete from "CommunicationSuppression" where id = $1 and "tenantId" = $2 and channel = 'PHONE'`, [suppressionId, tenantId]);
}

async function getTemplate(tenantId: string, templateId: string, client?: Queryable) {
  return queryOne<any>(
    `select id, channel, subject, body, "tokenDefaults", "lockedHeader", "lockedFooter"
     from "CommunicationTemplate"
     where "tenantId" = $1 and id = $2 and "isActive" = true
     limit 1`,
    [tenantId, templateId],
    client,
  );
}

// `client` lets a caller running inside its own transaction (the automation engine's
// send_email/WhatsApp/SMS action node) queue through this exact same consent/suppression
// path with the insert scoped to that transaction, instead of duplicating the checks.
export async function queueCommunicationForTenant(user: TenantUser, input: OutboxInput, client?: Queryable) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const recipient = normalizeAddress(channel, input.recipient);
  const suppressed =
    (await isSuppressed(tenantId, channel, recipient, client)) ||
    (await isOptedOut(tenantId, channel, input.entityType, input.entityId, client));

  // Fatigue/exclusion-window checks only apply to marketing-originated sends -- never to
  // transactional/system communications sharing the same outbox.
  let fatigueReason: string | null = null;
  if (!suppressed && (input.sourceType === "MARKETING_CAMPAIGN" || input.sourceType === "AUTOMATION")) {
    fatigueReason = (await checkExclusionWindow(tenantId, client)) || (await checkFatigueCap(tenantId, channel, input.entityType, input.entityId, client));
  }
  const blocked = suppressed || !!fatigueReason;

  let subject = input.subject ?? null;
  let body = input.body ?? "";
  if (input.templateId) {
    const template = await getTemplate(tenantId, input.templateId, client);
    if (!template) throw new Error("COMMUNICATION_TEMPLATE_NOT_FOUND");
    if (template.channel !== channel) throw new Error("TEMPLATE_CHANNEL_MISMATCH");
    subject = template.subject ? renderTemplate(template.subject, input.tokens, template.tokenDefaults) : subject;
    body = renderTemplate(template.body, input.tokens, template.tokenDefaults);
    body = await applyTemplateGovernance(tenantId, template, body, client);
  }
  if (!body.trim()) throw new Error("COMMUNICATION_BODY_REQUIRED");
  const now = new Date().toISOString();
  const payload = {
    ...(input.payload ?? {}),
    ...(input.fallback ? { fallback: input.fallback } : {}),
    ...(input.deliveryControls ? { deliveryControls: input.deliveryControls } : {}),
  };
  const row = await queryOne<any>(
    `insert into "CommunicationOutbox"
      (id, "tenantId", channel, "providerConfigId", "senderIdentityId", "templateId", recipient, subject, body,
       payload, status, "nextAttemptAt", "sourceType", "sourceId", "entityType", "entityId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)
     returning id, "tenantId", channel, recipient, subject, body, payload, status, attempts, "nextAttemptAt",
               "sourceType", "sourceId", "entityType", "entityId", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      tenantId,
      channel,
      input.providerConfigId || null,
      input.senderIdentityId || null,
      input.templateId || null,
      recipient,
      subject,
      body,
      payload,
      blocked ? "SUPPRESSED" : "QUEUED",
      input.scheduledAt || now,
      input.sourceType || null,
      input.sourceId || null,
      input.entityType || null,
      input.entityId || null,
      user.id,
      now,
    ],
    client,
  );
  if (!row) throw new Error("COMMUNICATION_OUTBOX_INSERT_FAILED");
  if (blocked) {
    await recordDeliveryEvent(
      tenantId,
      row.id,
      channel,
      "SUPPRESSED",
      fatigueReason ? { reason: fatigueReason } : {},
      input.entityType,
      input.entityId,
      client,
    );
    // Immediate fallback-on-block (item 8): a fallback send never carries its own `fallback`,
    // so this never chains further than one hop.
    if (input.fallback && input.fallback.immediate !== false) {
      await queueCommunicationForTenant(
        user,
        {
          channel: input.fallback.channel,
          recipient: input.fallback.recipient,
          subject: input.fallback.subject ?? null,
          body: input.fallback.body,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          entityType: input.entityType,
          entityId: input.entityId,
          payload: { fallbackFromOutboxId: row.id, fallbackReason: fatigueReason || "SUPPRESSED" },
        },
        client,
      ).catch(() => undefined);
    }
  }
  return row;
}

export async function listCommunicationOutboxForTenant(user: TenantUser, limit = 100) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, "tenantId", channel, recipient, subject, body, payload, status, attempts, "nextAttemptAt",
            "lastAttemptAt", "sentAt", error, "sourceType", "sourceId", "entityType", "entityId", "createdAt", "updatedAt"
     from "CommunicationOutbox"
     where "tenantId" = $1
     order by "createdAt" desc
     limit $2`,
    [tenantId, limit],
  );
}

export async function listCommunicationEventsForTenant(user: TenantUser, input: { entityType?: string | null; entityId?: string | null; limit?: number }) {
  const tenantId = requireTenantId(user);
  const entityType = String(input.entityType ?? "").trim().toUpperCase();
  const entityId = String(input.entityId ?? "").trim();
  if (!entityType || !entityId) throw new Error("COMMUNICATION_EVENT_ENTITY_REQUIRED");
  return query<any>(
    `select e.id, e."tenantId", e."outboxId", e.channel, e."eventType", e."providerMessageId", e."providerPayload",
            e."entityType", e."entityId", e."occurredAt", e."createdAt",
            o.recipient, o.subject, o.body, o.status, o."sourceType", o."sourceId"
     from "CommunicationDeliveryEvent" e
     left join "CommunicationOutbox" o on o.id = e."outboxId" and o."tenantId" = e."tenantId"
     where e."tenantId" = $1 and upper(e."entityType") = $2 and e."entityId" = $3
     order by e."occurredAt" desc
     limit $4`,
    [tenantId, entityType, entityId, Math.max(1, Math.min(200, Number(input.limit ?? 50)))],
  );
}

async function getProviderForMessage(message: any) {
  if (message.providerConfigId) {
    return queryOne<any>(
      `select id, channel, "providerType", name, config, "secretConfig"
       from "CommunicationProviderConfig"
       where "tenantId" = $1 and id = $2 and "isActive" = true
       limit 1`,
      [message.tenantId, message.providerConfigId],
    );
  }
  return queryOne<any>(
    `select id, channel, "providerType", name, config, "secretConfig"
     from "CommunicationProviderConfig"
     where "tenantId" = $1 and channel = $2 and "isActive" = true
     order by "updatedAt" desc
     limit 1`,
    [message.tenantId, message.channel],
  );
}

async function getSenderForMessage(message: any) {
  if (message.senderIdentityId) {
    return queryOne<any>(
      `select id, channel, name, address
       from "SenderIdentity"
       where "tenantId" = $1 and id = $2
       limit 1`,
      [message.tenantId, message.senderIdentityId],
    );
  }
  return queryOne<any>(
    `select id, channel, name, address
     from "SenderIdentity"
     where "tenantId" = $1 and channel = $2 and "isDefault" = true
     order by "updatedAt" desc
     limit 1`,
    [message.tenantId, message.channel],
  );
}

async function sendMessage(message: any) {
  const provider = await getProviderForMessage(message);
  if (!provider) throw new Error("COMMUNICATION_PROVIDER_NOT_CONFIGURED");
  if (provider.channel !== message.channel) throw new Error("COMMUNICATION_PROVIDER_CHANNEL_MISMATCH");
  const sender = await getSenderForMessage(message);

  if (provider.providerType === "SMTP") {
    if (message.channel !== "EMAIL") throw new Error("SMTP_ONLY_SUPPORTS_EMAIL");
    await sendSmtpEmail(provider, sender, message);
    return { providerMessageId: null };
  }

  const result = await sendGenericHttp(provider, sender, message);
  return { providerMessageId: result.providerMessageId ?? null, providerPayload: result };
}

function replacePayloadTokens(value: unknown, message: any, sender: any): unknown {
  if (typeof value === "string") {
    return renderTemplate(value, {
      recipient: message.recipient,
      subject: message.subject ?? "",
      body: message.body,
      sender: sender?.address ?? "",
    });
  }
  if (Array.isArray(value)) return value.map((item) => replacePayloadTokens(item, message, sender));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, replacePayloadTokens(nested, message, sender)]));
  }
  return value;
}

async function sendGenericHttp(provider: any, sender: any, message: any) {
  const endpointUrl = String(provider.config?.endpointUrl ?? "");
  if (!endpointUrl) throw new Error("HTTP_CONNECTOR_ENDPOINT_REQUIRED");
  const headers = replacePayloadTokens(provider.config?.headers ?? {}, message, sender) as Record<string, string>;
  const secretHeaders = provider.secretConfig?.headers && typeof provider.secretConfig.headers === "object" ? provider.secretConfig.headers : {};
  const bodyTemplate = provider.config?.bodyTemplate ?? {
    to: "{{recipient}}",
    from: "{{sender}}",
    body: "{{body}}",
  };
  const response = await fetch(endpointUrl, {
    method: String(provider.config?.method ?? "POST"),
    headers: { "Content-Type": "application/json", ...headers, ...secretHeaders },
    body: JSON.stringify(replacePayloadTokens(bodyTemplate, message, sender)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP_CONNECTOR_FAILED_${response.status}: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { response: text };
  }
}

async function sendSmtpEmail(provider: any, sender: any, message: any) {
  const host = String(provider.config?.host ?? "");
  const port = Number(provider.config?.port ?? 587);
  if (!host) throw new Error("SMTP_HOST_REQUIRED");
  const secure = provider.config?.secure === true || port === 465;
  const username = provider.secretConfig?.username ? String(provider.secretConfig.username) : "";
  const password = provider.secretConfig?.password ? String(provider.secretConfig.password) : "";
  const from = sender?.address || provider.config?.fromAddress;
  if (!from) throw new Error("SMTP_FROM_REQUIRED");

  await new Promise<void>((resolve, reject) => {
    const socket = secure ? tls.connect(port, host) : net.connect(port, host);
    let buffer = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve();
    };
    const command = (line: string) => socket.write(`${line}\r\n`);
    const waitFor = (code: string, next: () => void) => {
      const check = () => {
        if (buffer.includes(`\n${code}`) || buffer.startsWith(code)) {
          buffer = "";
          next();
          return true;
        }
        return false;
      };
      if (check()) return;
      socket.once("data", function onData(chunk) {
        buffer += chunk.toString("utf8");
        if (!check()) socket.once("data", onData);
      });
    };
    socket.setTimeout(15000, () => finish(new Error("SMTP_TIMEOUT")));
    socket.on("error", finish);
    waitFor("220", () => {
      command(`EHLO ${provider.config?.heloDomain || "crm.local"}`);
      waitFor("250", () => {
        const afterAuth = () => {
          command(`MAIL FROM:<${from}>`);
          waitFor("250", () => {
            command(`RCPT TO:<${message.recipient}>`);
            waitFor("250", () => {
              command("DATA");
              waitFor("354", () => {
                command(`From: ${from}\r\nTo: ${message.recipient}\r\nSubject: ${message.subject || ""}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message.body}\r\n.`);
                waitFor("250", () => {
                  command("QUIT");
                  finish();
                });
              });
            });
          });
        };
        if (username && password) {
          command(`AUTH PLAIN ${Buffer.from(`\0${username}\0${password}`).toString("base64")}`);
          waitFor("235", afterAuth);
        } else {
          afterAuth();
        }
      });
    });
  });
}

async function recordDeliveryEvent(
  tenantId: string,
  outboxId: string | null,
  channel: Channel,
  eventType: string,
  providerPayload: Record<string, unknown>,
  entityType?: string | null,
  entityId?: string | null,
  client?: Queryable,
) {
  const event = await queryOne<any>(
    `insert into "CommunicationDeliveryEvent"
      (id, "tenantId", "outboxId", channel, "eventType", "providerMessageId", "providerPayload", "entityType", "entityId", "occurredAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     returning id, "tenantId", "outboxId", channel, "eventType", "providerMessageId", "providerPayload", "entityType", "entityId", "occurredAt"`,
    [
      randomUUID(),
      tenantId,
      outboxId,
      channel,
      eventType,
      providerPayload.providerMessageId ?? null,
      providerPayload,
      entityType ?? null,
      entityId ?? null,
      new Date().toISOString(),
    ],
    client,
  );
  if (event?.entityType && event.entityId) {
    const systemUser = { id: "system", tenantId, name: "System", email: "system@local" };
    runAutomationsForEvent(
      systemUser,
      `COMMUNICATION_${String(eventType).toUpperCase()}`,
      String(event.entityType).toUpperCase(),
      String(event.entityId),
      {
        communication: event,
        channel,
        eventType,
        providerPayload,
        entityType: event.entityType,
        entityId: event.entityId,
      },
    ).catch(() => undefined);
    // Event-based NBA refresh (gap checklist: "worker job... plus event-based refresh on
    // lead/opportunity/activity/task/communication/scoring changes") -- entityType here is a
    // free-form string (not constrained to LEAD/OPPORTUNITY, unlike the other event sources),
    // so this only fires for the two record types NBA actually recommends against.
    const upperEntityType = String(event.entityType).toUpperCase();
    if (upperEntityType === "LEAD" || upperEntityType === "OPPORTUNITY") {
      refreshNextBestActionsForRecord(systemUser, upperEntityType, String(event.entityId)).catch(() => undefined);
    }
    // Gap checklist Module 16's app event bus, "communication" event domain -- previously
    // undelivered since no automation-trigger-equivalent hook existed for Communication at the
    // time of that pass; confirmed real now (this function's own runAutomationsForEvent call
    // above), so wired the same way ACTIVITY_CREATED/ACTIVITY_UPDATED already were. Unlike
    // Case's own fixed, bounded event vocabulary, `eventType` here is genuinely open-ended
    // (whatever a specific provider's own delivery-status callback reports) -- so only the two
    // values that come directly from the actual send attempt itself (not a provider callback)
    // get a bus event: SENT and FAILED. RETRY_SCHEDULED and any provider-specific callback
    // status stay internal-automation-only, a deliberate, narrower scope than Case's.
    const upperEventType = String(eventType).toUpperCase();
    if (upperEventType === "SENT" || upperEventType === "FAILED") {
      const busEventType = upperEventType === "SENT" ? "COMMUNICATION_SENT" : "COMMUNICATION_FAILED";
      const busPayload = { communication: event, channel, eventType, entityType: event.entityType, entityId: event.entityId };
      enqueueWebhookEvent(tenantId, busEventType, busPayload).catch(() => undefined);
      enqueueAppEvent(tenantId, busEventType, busPayload).catch(() => undefined);
    }
  }
  return event;
}

export async function processCommunicationOutbox(limit = 50, now = new Date()) {
  await queuePendingReportEmailDeliveries(now);
  const messages = await query<any>(
    `select id, "tenantId", channel, "providerConfigId", "senderIdentityId", recipient, subject, body, payload,
            attempts, "entityType", "entityId", "sourceType", "sourceId"
     from "CommunicationOutbox"
     where status = 'QUEUED' and "nextAttemptAt" <= $1
     order by "nextAttemptAt" asc
     limit $2`,
    [now.toISOString(), limit],
  );

  const processed = [];
  for (const message of messages) {
    const deferral = await marketingDeliveryDeferral(message, now);
    if (deferral) {
      await query(
        `update "CommunicationOutbox"
         set "nextAttemptAt" = $1, "updatedAt" = $2
         where id = $3`,
        [deferral.nextAttemptAt, now.toISOString(), message.id],
      );
      processed.push({ id: message.id, status: "DEFERRED", reason: deferral.reason, nextAttemptAt: deferral.nextAttemptAt });
      continue;
    }
    await query('update "CommunicationOutbox" set status = $1, attempts = attempts + 1, "lastAttemptAt" = $2, "updatedAt" = $2 where id = $3', [
      "SENDING",
      now.toISOString(),
      message.id,
    ]);
    try {
      const result = await sendMessage(message);
      await query('update "CommunicationOutbox" set status = $1, "sentAt" = $2, "updatedAt" = $2, error = null where id = $3', [
        "SENT",
        new Date().toISOString(),
        message.id,
      ]);
      await recordDeliveryEvent(message.tenantId, message.id, message.channel, "SENT", result, message.entityType, message.entityId);
      processed.push({ id: message.id, status: "SENT" });
    } catch (error: any) {
      const attempts = Number(message.attempts ?? 0) + 1;
      const failed = attempts >= 5;
      const nextAttemptAt = new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60000).toISOString();
      await query(
        `update "CommunicationOutbox"
         set status = $1, error = $2, "nextAttemptAt" = $3, "updatedAt" = $4
         where id = $5`,
        [failed ? "FAILED" : "QUEUED", error?.message ?? "Communication send failed", nextAttemptAt, new Date().toISOString(), message.id],
      );
      await recordDeliveryEvent(message.tenantId, message.id, message.channel, failed ? "FAILED" : "RETRY_SCHEDULED", {
        error: error?.message ?? "Communication send failed",
        attempts,
      }, message.entityType, message.entityId);
      processed.push({ id: message.id, status: failed ? "FAILED" : "QUEUED", error: error?.message ?? "Communication send failed" });

      // Delayed fallback-on-final-failure (item 8): only fires once retries are exhausted, and
      // never chains its own `fallback` further.
      const fallback = failed ? message.payload?.fallback : null;
      if (fallback?.channel && fallback?.recipient && fallback?.body) {
        const delayMs = Math.max(0, Number(fallback.delayMinutes ?? 0)) * 60000;
        await queueCommunicationForTenant(
          { id: "system", tenantId: message.tenantId },
          {
            channel: fallback.channel,
            recipient: fallback.recipient,
            subject: fallback.subject ?? null,
            body: fallback.body,
            sourceType: message.sourceType,
            sourceId: message.sourceId,
            entityType: message.entityType,
            entityId: message.entityId,
            scheduledAt: new Date(now.getTime() + delayMs).toISOString(),
            payload: { fallbackFromOutboxId: message.id, fallbackReason: "SEND_FAILED" },
          },
        ).catch(() => undefined);
      }
    }
  }
  return { processed };
}

async function marketingDeliveryDeferral(message: any, now: Date) {
  // Campaign-scoped controls are looked up from the MarketingCampaign row itself (the
  // original, pre-Module-8 path). Journey/automation sends (sourceType 'AUTOMATION') have no
  // single canonical config row to look up by sourceId, so the send_email automation node
  // resolves and embeds `payload.deliveryControls` directly on the outbox row instead --
  // generalizing this function to read either source, keyed by whichever `throttleKey` is in
  // play (falling back to sourceId for the campaign path, to preserve existing behavior).
  let controls: DeliveryControls | null = null;
  let throttleScope: { column: "sourceId" | "throttleKey"; value: string } | null = null;

  if (message.sourceType === "MARKETING_CAMPAIGN" && message.sourceId) {
    controls = await getMarketingDeliveryControls(message.tenantId, message.sourceId);
    throttleScope = controls ? { column: "sourceId", value: message.sourceId } : null;
  } else if (message.payload?.deliveryControls) {
    const embedded = message.payload.deliveryControls as { throttlePerMinute?: number | null; quietHours?: Record<string, unknown> | null; throttleKey?: string | null };
    if (embedded.throttlePerMinute || embedded.quietHours) {
      controls = { throttlePerMinute: Number(embedded.throttlePerMinute || 60), quietHours: embedded.quietHours || {} };
      throttleScope = embedded.throttleKey ? { column: "throttleKey", value: embedded.throttleKey } : null;
    }
  }
  if (!controls) return null;

  const quietUntil = nextQuietHoursExit(now, controls.quietHours);
  if (quietUntil) return { reason: "QUIET_HOURS", nextAttemptAt: quietUntil.toISOString() };
  if (!throttleScope) return null;

  const throttlePerMinute = Math.max(1, Number(controls.throttlePerMinute || 60));
  const sentInWindow = await queryOne<{ count: number }>(
    throttleScope.column === "sourceId"
      ? `select count(*)::int as count
         from "CommunicationOutbox"
         where "tenantId" = $1
           and "sourceType" = 'MARKETING_CAMPAIGN'
           and "sourceId" = $2
           and "lastAttemptAt" >= $3`
      : `select count(*)::int as count
         from "CommunicationOutbox"
         where "tenantId" = $1
           and payload->'deliveryControls'->>'throttleKey' = $2
           and "lastAttemptAt" >= $3`,
    [message.tenantId, throttleScope.value, new Date(now.getTime() - 60000).toISOString()],
  );
  if ((sentInWindow?.count ?? 0) >= throttlePerMinute) {
    return { reason: "THROTTLE", nextAttemptAt: new Date(now.getTime() + 60000).toISOString() };
  }
  return null;
}

async function getMarketingDeliveryControls(tenantId: string, campaignId: string): Promise<DeliveryControls | null> {
  return queryOne<DeliveryControls>(
    `select "throttlePerMinute", "quietHours"
     from "MarketingCampaign"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [tenantId, campaignId],
  );
}

function nextQuietHoursExit(now: Date, quietHours: Record<string, unknown>) {
  if (quietHours?.enabled === false) return null;
  const start = parseTimeOfDay(quietHours?.start, "21:00");
  const end = parseTimeOfDay(quietHours?.end, "09:00");
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const crossesMidnight = startMinutes > endMinutes;
  const inQuietHours = crossesMidnight
    ? minutesNow >= startMinutes || minutesNow < endMinutes
    : minutesNow >= startMinutes && minutesNow < endMinutes;
  if (!inQuietHours) return null;
  const next = new Date(now);
  next.setHours(end.hours, end.minutes, 0, 0);
  if (crossesMidnight && minutesNow >= startMinutes) next.setDate(next.getDate() + 1);
  return next;
}

function parseTimeOfDay(value: unknown, fallback: string) {
  const [hoursRaw, minutesRaw] = String(value || fallback).split(":");
  const hours = Math.max(0, Math.min(23, Number(hoursRaw || 0)));
  const minutes = Math.max(0, Math.min(59, Number(minutesRaw || 0)));
  return { hours, minutes };
}

async function queuePendingReportEmailDeliveries(now: Date) {
  const deliveries = await query<any>(
    `select id, "tenantId", "scheduleId", "reportKey", recipients, subject, body, format
     from "ReportEmailDelivery"
     where status = 'PENDING'
     order by "createdAt" asc
     limit 50`,
  );
  for (const delivery of deliveries) {
    const body = typeof delivery.body === "string" ? delivery.body : JSON.stringify(delivery.body, null, 2);
    for (const recipient of delivery.recipients ?? []) {
      await query(
        `insert into "CommunicationOutbox"
          (id, "tenantId", channel, recipient, subject, body, payload, status, "nextAttemptAt",
           "sourceType", "sourceId", "createdAt", "updatedAt")
         values ($1, $2, 'EMAIL', $3, $4, $5, $6, 'QUEUED', $7, 'REPORT_EMAIL_DELIVERY', $8, $7, $7)`,
        [randomUUID(), delivery.tenantId, normalizeAddress("EMAIL", recipient), delivery.subject, body, { reportKey: delivery.reportKey, format: delivery.format }, now.toISOString(), delivery.id],
      );
    }
    await query('update "ReportEmailDelivery" set status = $1, "sentAt" = $2 where id = $3', ["SENT", now.toISOString(), delivery.id]);
  }
}

export async function recordProviderWebhookEvent(input: {
  tenantId: string;
  channel: Channel;
  providerMessageId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  entityType?: string | null;
  entityId?: string | null;
}) {
  const channel = normalizeChannel(input.channel);
  return recordDeliveryEvent(input.tenantId, null, channel, input.eventType, {
    ...input.payload,
    providerMessageId: input.providerMessageId ?? null,
  }, input.entityType, input.entityId);
}
