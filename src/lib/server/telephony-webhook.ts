import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { createAuditLog, createActivityForTenant, ensureSystemActivityType } from "@/lib/server/crm";
import { runAutomationsForEvent } from "@/lib/repositories/automations-postgres";
import { isPhoneOptedOut, isPhoneSuppressed } from "@/lib/server/communications";
import { getInboundCallerContextForTenant } from "@/lib/server/inbound-caller-context";
import { createUserNotification } from "@/lib/server/notifications";
import { queueTelephonyCall } from "@/lib/server/call-queues";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

const REPLAY_WINDOW_SECONDS = 5 * 60;
const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;
const ANSWERED_STATUSES = new Set(["completed"]);
const MISSED_STATUSES = new Set(["missed", "no-answer"]);
const FAILED_STATUSES = new Set(["failed", "busy"]);
const VOICEMAIL_STATUSES = new Set(["voicemail"]);
const TERMINAL_STATUSES = new Set([...ANSWERED_STATUSES, ...MISSED_STATUSES, ...FAILED_STATUSES, ...VOICEMAIL_STATUSES]);

async function getTelephonySetting(tenantId: string) {
  return queryOne<{ id: string; config: any; isActive: boolean }>(
    `select id, config, "isActive" from "IntegrationSetting" where type = 'TELEPHONY' and "tenantId" = $1 limit 1`,
    [tenantId],
  );
}

function parseTimeOfDay(value: unknown, fallback: string) {
  const [hoursRaw, minutesRaw] = String(value || fallback).split(":");
  return { hours: Math.max(0, Math.min(23, Number(hoursRaw || 0))), minutes: Math.max(0, Math.min(59, Number(minutesRaw || 0))) };
}

// Same server-local-time window check the pre-existing marketing-campaign quiet hours
// (communications.ts's nextQuietHoursExit) already uses -- no per-tenant timezone lookup,
// matching that established, already-accepted simplification rather than introducing a new
// one just for calling.
function isWithinQuietHours(now: Date, quietHours: { enabled?: boolean; start?: string; end?: string } | undefined) {
  if (!quietHours?.enabled) return false;
  const start = parseTimeOfDay(quietHours.start, "21:00");
  const end = parseTimeOfDay(quietHours.end, "09:00");
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const crossesMidnight = startMinutes > endMinutes;
  return crossesMidnight ? minutesNow >= startMinutes || minutesNow < endMinutes : minutesNow >= startMinutes && minutesNow < endMinutes;
}

// Recording retention: computed once, at the moment a recording URL is captured, from the
// tenant's configured "recordingRetentionDays" (Telephony settings) -- not recomputed on every
// read, so changing the retention policy later doesn't retroactively change the expiry of
// recordings already captured under the old policy. No config value (or 0/negative) means
// "keep indefinitely," matching this app's existing precedent of treating an absent numeric
// config as "no limit" rather than defaulting to some arbitrary finite window.
function computeRecordingExpiresAt(config: any, hasRecording: boolean, referenceIso: string) {
  if (!hasRecording) return null;
  const days = Number(config?.recordingRetentionDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(new Date(referenceIso).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export type TelephonyComplianceResult = { allowed: true } | { allowed: false; reason: "SUPPRESSED" | "OPTED_OUT" | "QUIET_HOURS" };

// Outbound-only by design: DND/consent/quiet-hours are about calls a tenant places, not calls
// a tenant receives -- there's no sense in which an *inbound* call could be "suppressed" by
// this app. Checked immediately before dialing in buildClickToCallPayloadForTenant, not
// inside recordTelephonyCallEvent (which also serves the inbound webhook path).
export async function checkTelephonyComplianceForCall(
  tenantId: string,
  phoneNumber: string,
  context: { entityType?: "LEAD" | "OPPORTUNITY"; entityId?: string | null } = {},
): Promise<TelephonyComplianceResult> {
  if (await isPhoneSuppressed(tenantId, phoneNumber)) return { allowed: false, reason: "SUPPRESSED" };
  if (await isPhoneOptedOut(tenantId, context.entityType, context.entityId)) return { allowed: false, reason: "OPTED_OUT" };
  const setting = await getTelephonySetting(tenantId);
  if (isWithinQuietHours(new Date(), setting?.config?.callingQuietHours)) return { allowed: false, reason: "QUIET_HOURS" };
  return { allowed: true };
}

// Same per-tenant HMAC + rotation-grace-window scheme built for the inbound-lead webhook
// earlier this session (src/lib/server/inbound-webhooks.ts) -- applied here to close the
// identical class of gap (one global secret shared by every tenant) found in this module's
// audit pass.
export async function rotateTelephonyWebhookSecret(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const setting = await getTelephonySetting(user.tenantId);
  if (!setting) throw new Error("TELEPHONY_NOT_CONFIGURED");
  const now = new Date();
  const nextConfig = {
    ...setting.config,
    webhookSecret: randomUUID().replace(/-/g, ""),
    previousWebhookSecret: setting.config?.webhookSecret ?? null,
    previousWebhookSecretExpiresAt: setting.config?.webhookSecret ? new Date(now.getTime() + ROTATION_GRACE_MS).toISOString() : null,
  };
  const updated = await queryOne<{ id: string; config: any }>(
    `update "IntegrationSetting" set config = $1, "updatedAt" = $2 where id = $3 returning id, config`,
    [nextConfig, now.toISOString(), setting.id],
  );
  if (!updated) throw new Error("TELEPHONY_WEBHOOK_ROTATE_FAILED");
  await createAuditLog(user, "UPDATE", "TELEPHONY_WEBHOOK_SECRET", setting.id, null, null, { action: "rotate" });
  return { webhookSecret: nextConfig.webhookSecret, hasPreviousSecret: !!nextConfig.previousWebhookSecret, previousWebhookSecretExpiresAt: nextConfig.previousWebhookSecretExpiresAt };
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

export type TelephonyWebhookAuthResult =
  | { ok: true; mode: "hmac" | "legacy" }
  | { ok: false; reason: "MISSING_SIGNATURE" | "STALE_TIMESTAMP" | "INVALID_SIGNATURE" | "NOT_CONFIGURED" };

export async function verifyTelephonyWebhookRequest(
  tenantId: string,
  rawBody: string,
  headers: { signature?: string | null; timestamp?: string | null; legacySecret?: string | null },
): Promise<TelephonyWebhookAuthResult> {
  const legacyGlobalSecret = process.env.WEBHOOK_SIGNING_SECRET;
  if (headers.legacySecret && legacyGlobalSecret && headers.legacySecret === legacyGlobalSecret) {
    return { ok: true, mode: "legacy" };
  }

  if (!headers.signature || !headers.timestamp) return { ok: false, reason: "MISSING_SIGNATURE" };
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) return { ok: false, reason: "STALE_TIMESTAMP" };
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > REPLAY_WINDOW_SECONDS) return { ok: false, reason: "STALE_TIMESTAMP" };

  const setting = await getTelephonySetting(tenantId);
  const currentSecret = setting?.config?.webhookSecret;
  if (!currentSecret) return { ok: false, reason: "NOT_CONFIGURED" };

  const signedPayload = `${headers.timestamp}.${rawBody}`;
  if (safeEqualHex(hmacHex(currentSecret, signedPayload), headers.signature)) return { ok: true, mode: "hmac" };

  const previousSecret = setting?.config?.previousWebhookSecret;
  const previousExpiresAt = setting?.config?.previousWebhookSecretExpiresAt ? new Date(setting.config.previousWebhookSecretExpiresAt).getTime() : 0;
  if (previousSecret && previousExpiresAt > Date.now() && safeEqualHex(hmacHex(previousSecret, signedPayload), headers.signature)) {
    return { ok: true, mode: "hmac" };
  }
  return { ok: false, reason: "INVALID_SIGNATURE" };
}

// Reuses the existing automation engine (runAutomationsForEvent, the exact same trigger
// dispatcher LEAD_CREATED/OPPORTUNITY_CREATED/STAGE_CHANGED already fire through) rather than
// building a parallel call-specific automation system -- a tenant that already has automation
// rules configured for "create a task"/"send an email"/"notify the owner" can point one at
// these new triggers with zero new engine work. Only fires against a call's linked Lead or
// Opportunity (never the call log record itself, which has no automation actions that make
// sense against it) -- a call with neither linked is a no-op, nothing to automate against.
async function fireCallOutcomeAutomations(actor: TenantUser, callLog: Record<string, unknown>, status: string) {
  const entityType = callLog.leadId ? "LEAD" : callLog.opportunityId ? "OPPORTUNITY" : null;
  const entityId = callLog.leadId ? String(callLog.leadId) : callLog.opportunityId ? String(callLog.opportunityId) : null;
  if (!entityType || !entityId) return;

  const eventTypes: string[] = [];
  if (ANSWERED_STATUSES.has(status)) eventTypes.push("CALL_ANSWERED", "CALL_COMPLETED");
  else if (MISSED_STATUSES.has(status)) eventTypes.push("CALL_MISSED");
  else if (FAILED_STATUSES.has(status)) eventTypes.push("CALL_FAILED");
  if (callLog.recordingUrl) eventTypes.push("RECORDING_AVAILABLE");

  for (const eventType of eventTypes) {
    await runAutomationsForEvent(actor, eventType, entityType, entityId, callLog).catch(() => undefined);
  }
}

// Handles everything a genuinely NEW inbound call needs beyond the base log row: the popup
// notification (a Notification row carrying the matched caller context, picked up by the
// existing SSE pipe in src/providers/notification-provider.tsx and rendered by
// InboundCallPopupProvider -- the default toast is suppressed specifically for this type) and
// queue routing. Both reuse the SAME caller-context lookup rather than fetching it twice.
// Never called for a status update on an already-logged call (e.g. ringing -> answered) --
// that would re-pop and re-queue the same call.
async function handleNewInboundCall(actor: TenantUser, tenantId: string, config: any, callLog: Record<string, unknown>, status: string) {
  if (callLog.direction !== "INBOUND") return;
  const phoneNumber = callLog.fromNumber ? String(callLog.fromNumber) : null;
  if (!phoneNumber) return;

  const context = await getInboundCallerContextForTenant({ id: actor.id, tenantId }, phoneNumber);
  const matchedLead = context.leadMatches[0];

  await createUserNotification({
    tenantId,
    userId: actor.id,
    title: "Incoming call",
    message: matchedLead ? `${matchedLead.name} · ${phoneNumber}` : phoneNumber,
    data: { type: "INBOUND_CALL", callLogId: callLog.id, context },
    category: "CALLS",
  }).catch(() => undefined);

  // Queue routing: only for calls that actually need triage -- a call already matched to a
  // real Lead/Opportunity is being worked directly by whichever agent answered it, not sitting
  // in a queue. Requires a tenant-configured default team (`defaultCallQueueTeamId`); with none
  // configured, this is a deliberate no-op rather than guessing a destination.
  const defaultQueueTeamId = config?.defaultCallQueueTeamId ? String(config.defaultCallQueueTeamId) : null;
  if (!defaultQueueTeamId) return;

  const hasRecordMatch = !!callLog.leadId || !!callLog.opportunityId;
  let queueType: "MISSED_CALLBACK" | "PARTNER" | "INBOUND" | null = null;
  if (MISSED_STATUSES.has(status)) queueType = "MISSED_CALLBACK";
  else if (!hasRecordMatch) queueType = context.partnerMatches.length > 0 ? "PARTNER" : "INBOUND";

  if (queueType) {
    await queueTelephonyCall(tenantId, String(callLog.id), { teamId: defaultQueueTeamId, queueType }).catch(() => undefined);
  }
}

async function resolveCallEventActor(tenantId: string, config: any, input: Record<string, unknown>) {
  const mappings = Array.isArray(config?.userAgentMappings) ? config.userAgentMappings : [];
  const agentKey = input.agentId != null ? String(input.agentId) : input.agent != null ? String(input.agent) : null;
  if (agentKey) {
    const mapped = mappings.find((entry: any) => entry && String(entry.agentId ?? entry.extension ?? "") === agentKey);
    if (mapped?.userId) {
      const mappedUser = await queryOne<{ id: string; tenantId: string }>(
        `select id, "tenantId" from "User" where id = $1 and "tenantId" = $2 limit 1`,
        [String(mapped.userId), tenantId],
      );
      if (mappedUser) return mappedUser;
    }
  }
  // Fallback, unchanged from before this pass: no real "system actor" concept exists in this
  // codebase (AuditLog.userId has a real FK to User, so a synthetic id would fail) -- the
  // oldest tenant user is a placeholder attribution, not a correct one. Documented, not fixed
  // here, since introducing a real per-tenant system-user concept is a larger, separate change.
  return queryOne<{ id: string; tenantId: string }>(
    `select id, "tenantId" from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`,
    [tenantId],
  );
}

// Idempotent against provider retries: a second event for the same (tenantId, provider,
// callId) updates the existing row (status/duration/endedAt/recordingUrl) instead of
// inserting a duplicate, and only creates/updates the linked Activity on a genuine new row
// or a transition into a terminal status -- an intermediate "ringing"->"answered" update for
// an already-logged call does not spam a second Activity.
// `actorOverride` is for authenticated call sites (e.g. click-to-call) that already know
// exactly who's placing the call -- skips the agent-mapping/oldest-tenant-user inference
// entirely, which only exists to attribute events from the unauthenticated provider webhook.
export async function recordTelephonyCallEvent(tenantId: string, input: Record<string, unknown>, actorOverride?: TenantUser) {
  const setting = await getTelephonySetting(tenantId);
  const actor = actorOverride ?? (await resolveCallEventActor(tenantId, setting?.config, input));
  if (!actor) throw new Error("NO_TENANT_USER");

  const provider = input.provider ? String(input.provider) : "manual";
  const callId = input.callId ? String(input.callId) : randomUUID();
  const status = input.status ? String(input.status) : "completed";
  const now = new Date().toISOString();

  const existing = await queryOne<{ id: string; status: string; activityId: string | null; startedAt: string; recordingUrl: string | null }>(
    `select id, status, "activityId", "startedAt", "recordingUrl" from "TelephonyCallLog" where "tenantId" = $1 and provider = $2 and "callId" = $3 limit 1`,
    [tenantId, provider, callId],
  );

  const wasTerminalAlready = existing ? TERMINAL_STATUSES.has(existing.status) : false;
  const isTerminalNow = TERMINAL_STATUSES.has(status);
  const shouldTouchActivity = !existing || (isTerminalNow && !wasTerminalAlready);
  // Same transition-into-terminal gate as the Activity side above, kept as its own flag since
  // it also needs to be true for a brand-new row that lands directly on a terminal status
  // (shouldTouchActivity is *always* true for a new row, even a non-terminal "dialing" one --
  // this one specifically means "a real call outcome just became known").
  const shouldFireOutcomeAutomations = isTerminalNow && !wasTerminalAlready;

  let activityId: string | null = existing?.activityId ?? null;
  if (shouldTouchActivity && (input.leadId || input.opportunityId)) {
    const activity = await createActivityForTenant(actor, {
      typeId: await ensureSystemActivityType(actor, "Call", "Phone", "#3b82f6"),
      leadId: input.leadId,
      opportunityId: input.opportunityId,
      outcome: status === "completed" ? "SUCCESS" : status,
      notes: [
        input.direction ? `Direction: ${input.direction}` : null,
        input.fromNumber ? `From: ${input.fromNumber}` : null,
        input.toNumber ? `To: ${input.toNumber}` : null,
        input.duration ? `Duration: ${input.duration}s` : null,
        input.recordingUrl ? `Recording: ${input.recordingUrl}` : null,
      ].filter(Boolean).join("\n"),
    });
    activityId = activity.id;
  }

  if (existing) {
    const updatedHasRecording = !!input.recordingUrl;
    const updatedRecordingExpiresAt = computeRecordingExpiresAt(setting?.config, updatedHasRecording, existing.startedAt);
    const updated = await queryOne<any>(
      `update "TelephonyCallLog"
       set status = $1, duration = $2, "recordingUrl" = $3, "activityId" = coalesce($4, "activityId"), "endedAt" = $5, metadata = $6, "recordingExpiresAt" = $7
       where id = $8
       returning id, provider, "callId", direction, "fromNumber", "toNumber", status, duration,
                 "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata,
                 "startedAt", "endedAt", "createdAt", "recordingExpiresAt", transcript`,
      [
        status,
        input.duration == null ? null : Number(input.duration),
        input.recordingUrl ? String(input.recordingUrl) : null,
        activityId,
        input.endedAt ? String(input.endedAt) : null,
        input.metadata ?? {},
        updatedRecordingExpiresAt,
        existing.id,
      ],
    );
    await createAuditLog(actor, "UPDATE", "TELEPHONY_CALL_LOG", existing.id, null, updated, { status }).catch(() => undefined);
    if (shouldFireOutcomeAutomations) await fireCallOutcomeAutomations(actor, updated, status);
    return { ...updated, deduped: true };
  }

  const newStartedAt = input.startedAt ? String(input.startedAt) : now;
  const newRecordingExpiresAt = computeRecordingExpiresAt(setting?.config, !!input.recordingUrl, newStartedAt);
  const created = await queryOne<any>(
    `insert into "TelephonyCallLog" (
       id, "tenantId", provider, "callId", direction, "fromNumber", "toNumber", status, duration,
       "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata, "startedAt", "endedAt", "createdAt", "recordingExpiresAt"
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     returning id, provider, "callId", direction, "fromNumber", "toNumber", status, duration,
               "recordingUrl", "agentId", "leadId", "opportunityId", "activityId", metadata,
               "startedAt", "endedAt", "createdAt", "recordingExpiresAt", transcript`,
    [
      randomUUID(),
      tenantId,
      provider,
      callId,
      input.direction ? String(input.direction) : "OUTBOUND",
      input.fromNumber ? String(input.fromNumber) : null,
      input.toNumber ? String(input.toNumber) : null,
      status,
      input.duration == null ? null : Number(input.duration),
      input.recordingUrl ? String(input.recordingUrl) : null,
      input.agentId ? String(input.agentId) : actor.id,
      input.leadId ? String(input.leadId) : null,
      input.opportunityId ? String(input.opportunityId) : null,
      activityId,
      input.metadata ?? {},
      newStartedAt,
      input.endedAt ? String(input.endedAt) : null,
      now,
      newRecordingExpiresAt,
    ],
  );
  if (!created) throw new Error("TELEPHONY_CALL_LOG_CREATE_FAILED");
  await createAuditLog(actor, "CREATE", "TELEPHONY_CALL_LOG", created.id, null, created, null).catch(() => undefined);
  if (shouldFireOutcomeAutomations) await fireCallOutcomeAutomations(actor, created, status);
  await handleNewInboundCall(actor, tenantId, setting?.config, created, status).catch(() => undefined);
  return { ...created, deduped: false };
}

export async function listTelephonyWebhookEventsForTenant(user: TenantUser, limit = 50) {
  if (!user.tenantId) return [];
  return query<any>(
    `select id, provider, "callId", status, "fromNumber", "toNumber", duration, "activityId", "createdAt"
     from "TelephonyCallLog"
     where "tenantId" = $1
     order by "createdAt" desc
     limit $2`,
    [user.tenantId, Math.min(200, Math.max(1, limit))],
  );
}
