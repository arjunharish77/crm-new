import { assertModuleEnabled, assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { query, queryOne, execute, jsonbParam } from "@/lib/db/query";
import { createAuditLog, createLeadForTenant } from "@/lib/server/crm";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

const REPLAY_WINDOW_SECONDS = 5 * 60;
const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

type InboundWebhookConfig = {
  currentSecret: string;
  previousSecret?: string | null;
  previousSecretExpiresAt?: string | null;
};

async function getInboundWebhookSetting(tenantId: string) {
  return queryOne<{ id: string; config: InboundWebhookConfig; isActive: boolean }>(
    `select id, config, "isActive" from "IntegrationSetting" where type = 'INBOUND_WEBHOOK' and "tenantId" = $1 limit 1`,
    [tenantId],
  );
}

async function ensureInboundWebhookSetting(tenantId: string) {
  const existing = await getInboundWebhookSetting(tenantId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const config: InboundWebhookConfig = { currentSecret: randomBytes(24).toString("hex"), previousSecret: null, previousSecretExpiresAt: null };
  const created = await queryOne<{ id: string; config: InboundWebhookConfig; isActive: boolean }>(
    `insert into "IntegrationSetting" (id, "tenantId", type, config, "isActive", "createdAt", "updatedAt")
     values ($1, $2, 'INBOUND_WEBHOOK', $3, true, $4, $4)
     returning id, config, "isActive"`,
    [randomUUID(), tenantId, config, now],
  );
  if (!created) throw new Error("INBOUND_WEBHOOK_SETTING_CREATE_FAILED");
  return created;
}

// Admin-facing read -- returns the live secret value, not just a masked indicator, so an
// admin can copy it into whatever external form/tool needs to sign requests. Consistent
// with this codebase's existing posture on integration secrets (plaintext at rest
// everywhere, e.g. ExternalIntegration.secretConfig -- no encryption-at-rest exists
// anywhere here today), not a new regression introduced by this feature.
export async function getInboundWebhookSettingsForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "DATA_PLATFORM");
  const setting = await ensureInboundWebhookSetting(user.tenantId);
  return {
    currentSecret: setting.config.currentSecret,
    hasPreviousSecret: !!setting.config.previousSecret,
    previousSecretExpiresAt: setting.config.previousSecretExpiresAt ?? null,
    isActive: setting.isActive,
  };
}

export async function rotateInboundWebhookSecret(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "DATA_PLATFORM");
  const setting = await ensureInboundWebhookSetting(user.tenantId);
  const now = new Date();
  const nextConfig: InboundWebhookConfig = {
    currentSecret: randomBytes(24).toString("hex"),
    previousSecret: setting.config.currentSecret,
    previousSecretExpiresAt: new Date(now.getTime() + ROTATION_GRACE_MS).toISOString(),
  };
  const updated = await queryOne<{ id: string; config: InboundWebhookConfig; isActive: boolean }>(
    `update "IntegrationSetting" set config = $1, "updatedAt" = $2 where id = $3 returning id, config, "isActive"`,
    [nextConfig, now.toISOString(), setting.id],
  );
  if (!updated) throw new Error("INBOUND_WEBHOOK_ROTATE_FAILED");
  await createAuditLog(user, "UPDATE", "INBOUND_WEBHOOK_SECRET", setting.id, null, null, { action: "rotate" });
  return { currentSecret: nextConfig.currentSecret, hasPreviousSecret: true, previousSecretExpiresAt: nextConfig.previousSecretExpiresAt, isActive: updated.isActive };
}

function hmacHex(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type InboundWebhookAuthResult =
  | { ok: true; mode: "hmac" }
  | { ok: false; reason: "MISSING_SIGNATURE" | "STALE_TIMESTAMP" | "INVALID_SIGNATURE" | "NOT_CONFIGURED" };

// Signature covers `${timestamp}.${rawBody}`, not just the body -- binding the timestamp
// into the signed material (not just checking it separately) is what makes an old captured
// request unusable even if replayed verbatim: you can't forge a signature for a *new*
// timestamp without the secret. The old server-wide shared secret (WEBHOOK_SIGNING_SECRET) is
// no longer accepted: it let anyone holding it write into any workspace (round-2 plan S1).
// A turned-off webhook rejects everything (S14).
export async function verifyInboundWebhookRequest(
  tenantId: string,
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null },
): Promise<InboundWebhookAuthResult> {
  if (!headers.signature || !headers.timestamp) return { ok: false, reason: "MISSING_SIGNATURE" };
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "STALE_TIMESTAMP" };
  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > REPLAY_WINDOW_SECONDS) return { ok: false, reason: "STALE_TIMESTAMP" };

  const setting = await getInboundWebhookSetting(tenantId);
  if (!setting?.isActive || !setting.config?.currentSecret) return { ok: false, reason: "NOT_CONFIGURED" };

  const signedPayload = `${headers.timestamp}.${rawBody}`;
  const expectedCurrent = hmacHex(setting.config.currentSecret, signedPayload);
  if (safeEqualHex(expectedCurrent, headers.signature)) return { ok: true, mode: "hmac" };

  const previousSecret = setting.config.previousSecret;
  const previousExpiresAt = setting.config.previousSecretExpiresAt ? new Date(setting.config.previousSecretExpiresAt).getTime() : 0;
  if (previousSecret && previousExpiresAt > Date.now()) {
    const expectedPrevious = hmacHex(previousSecret, signedPayload);
    if (safeEqualHex(expectedPrevious, headers.signature)) return { ok: true, mode: "hmac" };
  }

  return { ok: false, reason: "INVALID_SIGNATURE" };
}

export function validateInboundLeadPayload(body: any): string | null {
  if (!body || typeof body !== "object") return "Request body must be a JSON object";
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) return "name is required and must be a non-empty string";
  if (body.email !== undefined && body.email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) {
    return "email must be a valid email address";
  }
  if (body.phone !== undefined && body.phone !== null && typeof body.phone !== "string") return "phone must be a string";
  return null;
}

async function recordInboundWebhookEvent(input: {
  tenantId: string;
  idempotencyKey?: string | null;
  status: "ACCEPTED" | "DUPLICATE" | "REJECTED" | "FAILED";
  payload: unknown;
  leadId?: string | null;
  errorMessage?: string | null;
}) {
  return execute(
    `insert into "InboundWebhookEvent" (id, "tenantId", "idempotencyKey", status, payload, "leadId", "errorMessage", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [randomUUID(), input.tenantId, input.idempotencyKey ?? null, input.status, jsonbParam(input.payload), input.leadId ?? null, input.errorMessage ?? null, new Date().toISOString()],
  );
}

async function findDuplicateInboundEvent(tenantId: string, idempotencyKey: string) {
  return queryOne<{ id: string; status: string; "leadId": string | null }>(
    `select id, status, "leadId" from "InboundWebhookEvent" where "tenantId" = $1 and "idempotencyKey" = $2 limit 1`,
    [tenantId, idempotencyKey],
  );
}

// The whole capture flow, called by the unauthenticated inbound route after it's already
// read the raw body: schema validation -> idempotency-key dedupe -> create -> event log.
// Centralized here (not left inline in the route) so the "test payload" console below can
// exercise the exact same path a real external caller hits.
export async function captureInboundLead(tenantId: string, body: any, idempotencyKey?: string | null) {
  await assertModuleEnabled(tenantId, "DATA_PLATFORM");
  const validationError = validateInboundLeadPayload(body);
  if (validationError) {
    await recordInboundWebhookEvent({ tenantId, idempotencyKey, status: "REJECTED", payload: body, errorMessage: validationError });
    throw new Error(`VALIDATION:${validationError}`);
  }

  if (idempotencyKey) {
    const duplicate = await findDuplicateInboundEvent(tenantId, idempotencyKey);
    if (duplicate) {
      await recordInboundWebhookEvent({ tenantId, idempotencyKey: `${idempotencyKey}:dup:${randomUUID()}`, status: "DUPLICATE", payload: body });
      return { duplicate: true, leadId: duplicate.leadId ?? null };
    }
  }

  const owner = await queryOne<{ id: string; tenantId: string }>(
    `select id, "tenantId" from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`,
    [tenantId],
  );
  if (!owner?.id) {
    await recordInboundWebhookEvent({ tenantId, idempotencyKey, status: "FAILED", payload: body, errorMessage: "No active tenant user found" });
    throw new Error("NO_TENANT_USER");
  }

  try {
    const lead = await createLeadForTenant(owner, { ...body, source: body.source ?? "Inbound Webhook" });
    await recordInboundWebhookEvent({ tenantId, idempotencyKey, status: "ACCEPTED", payload: body, leadId: lead.id });
    return { duplicate: false, leadId: lead.id, lead };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lead creation failed";
    await recordInboundWebhookEvent({ tenantId, idempotencyKey, status: "FAILED", payload: body, errorMessage: message });
    throw error;
  }
}

export async function listInboundWebhookEventsForTenant(user: TenantUser, limit = 50) {
  if (!user.tenantId) return [];
  await assertTenantModule(user, "DATA_PLATFORM");
  return query<any>(
    `select id, "idempotencyKey", status, payload, "leadId", "errorMessage", "createdAt"
     from "InboundWebhookEvent" where "tenantId" = $1 order by "createdAt" desc limit $2`,
    [user.tenantId, Math.min(200, Math.max(1, limit))],
  );
}

// Dead-letter retry: re-runs the exact stored payload through the same capture path. Only
// FAILED events are retryable -- REJECTED (bad payload) would just fail validation again,
// ACCEPTED/DUPLICATE already have an outcome.
export async function retryInboundWebhookEvent(user: TenantUser, eventId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "DATA_PLATFORM");
  const event = await queryOne<{ id: string; payload: any; status: string }>(
    `select id, payload, status from "InboundWebhookEvent" where id = $1 and "tenantId" = $2 limit 1`,
    [eventId, user.tenantId],
  );
  if (!event) throw new Error("INBOUND_WEBHOOK_EVENT_NOT_FOUND");
  if (event.status !== "FAILED") throw new Error("INBOUND_WEBHOOK_EVENT_NOT_RETRYABLE");
  await createAuditLog(user, "UPDATE", "INBOUND_WEBHOOK_EVENT", eventId, null, null, { action: "retry" });
  return captureInboundLead(user.tenantId, event.payload, `retry:${eventId}:${randomUUID()}`);
}

// Test payload console: computes the exact timestamp + HMAC signature an external caller
// would need for this payload against the tenant's current secret (so an admin can copy it
// into curl/Postman to verify their own signing implementation), AND actually runs the
// payload through the real capture path so the result shown is genuine, not simulated.
export async function sendTestInboundWebhookPayload(user: TenantUser, payload: Record<string, unknown>) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  await assertTenantModule(user, "DATA_PLATFORM");
  const setting = await ensureInboundWebhookSetting(user.tenantId);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify(payload);
  const signature = hmacHex(setting.config.currentSecret, `${timestamp}.${rawBody}`);

  let result: Awaited<ReturnType<typeof captureInboundLead>> | null = null;
  let error: string | null = null;
  try {
    result = await captureInboundLead(user.tenantId, payload, `test:${randomUUID()}`);
  } catch (err) {
    error = err instanceof Error ? err.message : "Test payload failed";
  }

  return {
    request: {
      url: `/api/integrations/inbound/leads/${user.tenantId}`,
      headers: { "x-webhook-timestamp": timestamp, "x-webhook-signature": signature, "content-type": "application/json" },
      body: rawBody,
    },
    result,
    error,
  };
}
