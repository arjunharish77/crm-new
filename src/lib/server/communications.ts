import { randomUUID } from "crypto";
import net from "net";
import tls from "tls";
import { query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

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

export function renderTemplate(text: string, tokens: Record<string, unknown> = {}) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => String(tokens[key] ?? ""));
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

export async function listCommunicationTemplatesForTenant(user: TenantUser) {
  const tenantId = requireTenantId(user);
  return query<any>(
    `select id, "tenantId", channel, name, subject, body, tokens, metadata, "isActive", "createdAt", "updatedAt"
     from "CommunicationTemplate"
     where "tenantId" = $1
     order by channel asc, name asc`,
    [tenantId],
  );
}

export async function upsertCommunicationTemplateForTenant(user: TenantUser, input: TemplateInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const name = String(input.name ?? "").trim();
  if (!name || !input.body?.trim()) throw new Error("TEMPLATE_NAME_BODY_REQUIRED");
  const tokens = input.tokens?.length ? input.tokens : extractTokens(`${input.subject ?? ""}\n${input.body}`);
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationTemplate"
      (id, "tenantId", channel, name, subject, body, tokens, metadata, "isActive", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     on conflict ("tenantId", channel, name) do update set
       subject = excluded.subject,
       body = excluded.body,
       tokens = excluded.tokens,
       metadata = excluded.metadata,
       "isActive" = excluded."isActive",
       "updatedAt" = excluded."updatedAt"
     returning id, "tenantId", channel, name, subject, body, tokens, metadata, "isActive", "createdAt", "updatedAt"`,
    [
      input.id || randomUUID(),
      tenantId,
      channel,
      name,
      input.subject || null,
      input.body,
      tokens,
      input.metadata ?? {},
      input.isActive !== false,
      user.id,
      now,
    ],
  );
  if (!row) throw new Error("COMMUNICATION_TEMPLATE_UPSERT_FAILED");
  return row;
}

async function isSuppressed(tenantId: string, channel: Channel, recipient: string) {
  const row = await queryOne<any>(
    `select id from "CommunicationSuppression"
     where "tenantId" = $1 and channel = $2 and address = $3
     limit 1`,
    [tenantId, channel, recipient],
  );
  return !!row;
}

async function isOptedOut(tenantId: string, channel: Channel, entityType?: string | null, entityId?: string | null) {
  if (!entityType || !entityId) return false;
  const row = await queryOne<any>(
    `select status from "CommunicationConsent"
     where "tenantId" = $1 and "entityType" = $2 and "entityId" = $3 and channel = $4
     limit 1`,
    [tenantId, entityType, entityId, channel],
  );
  return row?.status === "OPTED_OUT";
}

async function getTemplate(tenantId: string, templateId: string) {
  return queryOne<any>(
    `select id, channel, subject, body
     from "CommunicationTemplate"
     where "tenantId" = $1 and id = $2 and "isActive" = true
     limit 1`,
    [tenantId, templateId],
  );
}

export async function queueCommunicationForTenant(user: TenantUser, input: OutboxInput) {
  const tenantId = requireTenantId(user);
  const channel = normalizeChannel(input.channel);
  const recipient = normalizeAddress(channel, input.recipient);
  const suppressed = await isSuppressed(tenantId, channel, recipient) || await isOptedOut(tenantId, channel, input.entityType, input.entityId);
  let subject = input.subject ?? null;
  let body = input.body ?? "";
  if (input.templateId) {
    const template = await getTemplate(tenantId, input.templateId);
    if (!template) throw new Error("COMMUNICATION_TEMPLATE_NOT_FOUND");
    if (template.channel !== channel) throw new Error("TEMPLATE_CHANNEL_MISMATCH");
    subject = template.subject ? renderTemplate(template.subject, input.tokens) : subject;
    body = renderTemplate(template.body, input.tokens);
  }
  if (!body.trim()) throw new Error("COMMUNICATION_BODY_REQUIRED");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "CommunicationOutbox"
      (id, "tenantId", channel, "providerConfigId", "senderIdentityId", "templateId", recipient, subject, body,
       payload, status, "nextAttemptAt", "sourceType", "sourceId", "entityType", "entityId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $12, $12)
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
      input.payload ?? {},
      suppressed ? "SUPPRESSED" : "QUEUED",
      now,
      input.sourceType || null,
      input.sourceId || null,
      input.entityType || null,
      input.entityId || null,
      user.id,
    ],
  );
  if (!row) throw new Error("COMMUNICATION_OUTBOX_INSERT_FAILED");
  if (suppressed) await recordDeliveryEvent(tenantId, row.id, channel, "SUPPRESSED", {}, input.entityType, input.entityId);
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
) {
  return queryOne<any>(
    `insert into "CommunicationDeliveryEvent"
      (id, "tenantId", "outboxId", channel, "eventType", "providerMessageId", "providerPayload", "entityType", "entityId", "occurredAt", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
     returning id`,
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
  );
}

export async function processCommunicationOutbox(limit = 50, now = new Date()) {
  await queuePendingReportEmailDeliveries(now);
  const messages = await query<any>(
    `select id, "tenantId", channel, "providerConfigId", "senderIdentityId", recipient, subject, body, payload,
            attempts, "entityType", "entityId"
     from "CommunicationOutbox"
     where status = 'QUEUED' and "nextAttemptAt" <= $1
     order by "nextAttemptAt" asc
     limit $2`,
    [now.toISOString(), limit],
  );

  const processed = [];
  for (const message of messages) {
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
    }
  }
  return { processed };
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
