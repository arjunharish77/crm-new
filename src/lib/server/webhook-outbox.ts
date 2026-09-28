import { randomUUID, createHmac } from "crypto";
import { query, queryOne, execute, queryAsSystem, queryOneAsSystem, type Queryable } from "@/lib/db/query";
import { createUserNotification } from "@/lib/server/notifications";
import { checkRateLimitWithAlert } from "@/lib/server/rate-limit";
import { assertSafeOutboundUrl } from "@/lib/server/outbound-request-guard";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

// Same vocabulary the existing automation-trigger call sites already use (LEAD_CREATED,
// LEAD_UPDATED, OPPORTUNITY_CREATED, OPPORTUNITY_UPDATED, STAGE_CHANGED) -- unifies naming
// with automations instead of the old, never-actually-selectable "LEAD.CREATED" default the
// Add Webhook dialog hardcoded (there was no event picker UI at all before this pass).
// ACTIVITY_CREATED/ACTIVITY_UPDATED added to extend the same bus to the Activity domain,
// matching automations-postgres.ts's flat (non-opportunity-scoped) event names -- the
// "_ON_OPPORTUNITY" variants automations also fire are an automation-trigger-matching detail,
// not something an external webhook/app subscriber needs as a separate event to pick from.
//
// Gap checklist Module 16's app event bus, extended to 3 more domains (Task, Case,
// Communication) once each one's own real automation-trigger-equivalent hook was confirmed to
// exist (built when Modules 1/11 were completed after this bus's original pass) -- Partner,
// Payout, and Scoring still have no such hook anywhere in this codebase, so they stay genuinely
// unwired, not a scoping choice. TASK_CREATED/TASK_UPDATED collapse Task's own richer internal
// vocabulary (CREATED/UPDATED/COMPLETED/REMINDER/OVERDUE, each also split _ON_LEAD/_ON_OPPORTUNITY
// for automation-trigger matching) down to 2 flat types, the same way ACTIVITY_* already did.
// The 7 CASE_* types reuse Case's own internal vocabulary verbatim instead -- already a fixed,
// bounded, meaningful set, so an external subscriber gets the same real granularity automations
// do. COMMUNICATION_SENT/COMMUNICATION_FAILED are deliberately narrower than Case's: a
// communication's own `eventType` is genuinely open-ended (whatever a specific provider's
// delivery-status callback reports), so only the two values from the actual send attempt itself
// get a bus event.
export const WEBHOOK_EVENT_TYPES = [
  "LEAD_CREATED", "LEAD_UPDATED", "OPPORTUNITY_CREATED", "OPPORTUNITY_UPDATED", "STAGE_CHANGED", "ACTIVITY_CREATED", "ACTIVITY_UPDATED",
  "TASK_CREATED", "TASK_UPDATED",
  "CASE_CREATED", "CASE_ASSIGNED", "CASE_UPDATED", "CASE_COMMENTED", "CASE_RESOLVED", "CASE_REOPENED", "CASE_STATUS_CHANGED", "CASE_SLA_WARNING", "CASE_SLA_BREACHED",
  "COMMUNICATION_SENT", "COMMUNICATION_FAILED",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]; // 1m, 5m, 30m, 2h, 12h
const REQUEST_TIMEOUT_MS = 15_000;

function backoffMs(retryCount: number) {
  const minutes = BACKOFF_MINUTES[Math.min(retryCount, BACKOFF_MINUTES.length - 1)];
  return minutes * 60 * 1000;
}

function signPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

// Called from the same places runAutomationsForEvent already is (leads-postgres.ts /
// opportunities-postgres.ts) -- fans out to every active subscription actually listening
// for this event, one WebhookOutbox row per (event, subscription) so each endpoint has its
// own independent delivery lifecycle (one endpoint being down doesn't block another).
// WP08 (F13): optional `client` -- when passed (e.g. createLeadForTenant's atomic core), this
// insert commits or rolls back together with the record change and its audit row instead of
// being a separately-fallible write. Every existing caller already wraps its own call site in
// `.catch(() => undefined)`, so no longer swallowing the insert error internally here doesn't
// change their behavior -- it only stops masking the failure from a caller (the new atomic-core
// path) that needs it to actually propagate and roll back.
export async function enqueueWebhookEvent(
  tenantId: string | null,
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  client?: Queryable,
) {
  if (!tenantId) return;
  const subscriptions = await query<{ id: string }>(
    `select id from "WebhookSubscription"
     where "tenantId" = $1 and "isActive" = true and events @> $2::jsonb`,
    [tenantId, JSON.stringify([eventType])],
    client,
  );
  if (!subscriptions.length) return;
  const now = new Date().toISOString();
  for (const subscription of subscriptions) {
    await execute(
      `insert into "WebhookOutbox" (id, "tenantId", "subscriptionId", "eventType", "eventVersion", payload, status, "retryCount", "nextRetryAt", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, 1, $5, 'PENDING', 0, $6, $6, $6)`,
      [randomUUID(), tenantId, subscription.id, eventType, payload, now],
      client,
    );
  }
}

async function deliverOne(row: {
  id: string;
  tenantId: string;
  subscriptionId: string;
  eventType: string;
  eventVersion: number;
  payload: any;
  retryCount: number;
}) {
  const subscription = await queryOne<{ id: string; url: string; secret: string | null; isActive: boolean; rateLimitPerMinute: number }>(
    `select id, url, secret, "isActive", "rateLimitPerMinute" from "WebhookSubscription" where id = $1`,
    [row.subscriptionId],
  );
  if (!subscription || !subscription.isActive) {
    await execute(`update "WebhookOutbox" set status = 'CANCELLED', "leaseExpiresAt" = null, "updatedAt" = $1 where id = $2`, [new Date().toISOString(), row.id]);
    return;
  }

  // Webhook throttling -- per-minute, so unlike the marketplace daily-delivery-limit precedent
  // (which cancels outright, since waiting doesn't help until the next day), this is transient:
  // re-queue for a short retry rather than failing or counting against the real retryCount/
  // MAX_ATTEMPTS budget, so a burst that trips the limit doesn't also burn through this
  // delivery's actual failure allowance.
  const throttle = await checkRateLimitWithAlert({
    key: `webhook:${subscription.id}`,
    limit: subscription.rateLimitPerMinute,
    windowSeconds: 60,
    tenantId: row.tenantId,
    category: "WEBHOOK",
    detail: `subscription ${subscription.id} (${subscription.url})`,
  });
  if (!throttle.allowed) {
    await execute(
      `update "WebhookOutbox" set status = 'PENDING', "nextRetryAt" = $1, "leaseExpiresAt" = null, "updatedAt" = $1 where id = $2`,
      [new Date(Date.now() + 15_000).toISOString(), row.id],
    );
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({ eventType: row.eventType, eventVersion: row.eventVersion, data: row.payload });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  try {
    // F07 fix (WP06): revalidated immediately before every actual delivery attempt, not only at
    // save time -- the subscription's own hostname could resolve to a private/internal address
    // by the time a queued event is actually delivered, even if it didn't when first saved.
    await assertSafeOutboundUrl(subscription.url);
    const headers: Record<string, string> = { "content-type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-event": row.eventType };
    if (subscription.secret) headers["x-webhook-signature"] = signPayload(subscription.secret, timestamp, rawBody);
    const response = await fetch(subscription.url, { method: "POST", headers, body: rawBody, signal: controller.signal, redirect: "manual" });
    httpStatus = response.status;
    responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    if (!response.ok) errorMessage = `HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Network error";
  } finally {
    clearTimeout(timeout);
  }

  const now = new Date().toISOString();
  if (!errorMessage) {
    await execute(
      `update "WebhookOutbox" set status = 'DELIVERED', "httpStatus" = $1, "responseBody" = $2, "processedAt" = $3, "leaseExpiresAt" = null, "updatedAt" = $3, error = null where id = $4`,
      [httpStatus, responseBody, now, row.id],
    );
    return;
  }

  const nextRetryCount = row.retryCount + 1;
  if (nextRetryCount >= MAX_ATTEMPTS) {
    await execute(
      `update "WebhookOutbox" set status = 'FAILED', "retryCount" = $1, "httpStatus" = $2, "responseBody" = $3, error = $4, "leaseExpiresAt" = null, "updatedAt" = $5 where id = $6`,
      [nextRetryCount, httpStatus, responseBody, errorMessage, now, row.id],
    );
    const owner = await queryOne<{ id: string }>(`select id from "User" where "tenantId" = $1 order by "createdAt" asc limit 1`, [row.tenantId]);
    if (owner) {
      await createUserNotification({
        tenantId: row.tenantId,
        userId: owner.id,
        title: "Webhook delivery failing",
        message: `Deliveries to ${subscription.url} have failed ${nextRetryCount} times in a row (last: ${errorMessage}). The endpoint has stopped retrying.`,
        data: { type: "webhooks.deliveryFailed", subscriptionId: subscription.id, eventType: row.eventType },
        category: "INTEGRATIONS",
      }).catch(() => undefined);
    }
    return;
  }

  await execute(
    `update "WebhookOutbox" set status = 'PENDING', "retryCount" = $1, "nextRetryAt" = $2, "httpStatus" = $3, "responseBody" = $4, error = $5, "leaseExpiresAt" = null, "updatedAt" = $6 where id = $7`,
    [nextRetryCount, new Date(Date.now() + backoffMs(nextRetryCount)).toISOString(), httpStatus, responseBody, errorMessage, now, row.id],
  );
}

// F14 fix (WP10): how long a claim is honored before another drain tick is allowed to treat it
// as abandoned and reclaim it. Comfortably larger than REQUEST_TIMEOUT_MS (15s) plus the rest of
// deliverOne's own DB writes, so a healthy in-flight delivery is never reclaimed out from under
// itself -- only a worker that crashed/was killed between claim and its final status update
// leaves a row here long enough to be reclaimed.
const LEASE_DURATION_MS = 5 * 60 * 1000;

// Worker-invoked recurring job: claims due rows (PENDING-and-due, OR SENDING-with-an-expired-
// lease) one at a time via an atomic claim so two overlapping worker ticks can't double-send the
// same delivery, then dispatches each in turn. The SENDING-with-expired-lease branch is the F14
// fix: previously a row claimed into SENDING had no expiry at all, so a worker crash between the
// claim and deliverOne's final status update left it stuck in SENDING forever with no recovery.
// WP07 (F04): BACKGROUND_JOB, disposition B -- worker-invoked recurring job with no ambient
// tenant context; discovers/claims due deliveries across every tenant at once.
export async function processWebhookOutbox(limit = 25) {
  const now = new Date().toISOString();
  const due = await queryAsSystem<{ id: string }>(
    `select id from "WebhookOutbox"
     where (status = 'PENDING' and ("nextRetryAt" is null or "nextRetryAt" <= $1))
        or (status = 'SENDING' and "leaseExpiresAt" is not null and "leaseExpiresAt" <= $1)
     order by "createdAt" asc limit $2`,
    [now, limit],
  );
  let processed = 0;
  for (const item of due) {
    const claimTime = new Date().toISOString();
    const leaseExpiresAt = new Date(Date.now() + LEASE_DURATION_MS).toISOString();
    const claimed = await queryOneAsSystem<any>(
      `update "WebhookOutbox"
       set status = 'SENDING', "leaseExpiresAt" = $1, "updatedAt" = $2
       where id = $3
         and (status = 'PENDING' or (status = 'SENDING' and "leaseExpiresAt" is not null and "leaseExpiresAt" <= $2))
       returning id, "tenantId", "subscriptionId", "eventType", "eventVersion", payload, "retryCount"`,
      [leaseExpiresAt, claimTime, item.id],
    );
    if (!claimed) continue;
    await deliverOne(claimed);
    processed += 1;
  }
  return { processed };
}

export async function listWebhookDeliveriesForSubscription(user: TenantUser, subscriptionId: string, limit = 50) {
  if (!user.tenantId) return [];
  return query<any>(
    `select wo.id, wo."eventType", wo.status, wo."retryCount", wo."httpStatus", wo."responseBody", wo.error, wo."createdAt", wo."processedAt"
     from "WebhookOutbox" wo
     join "WebhookSubscription" ws on ws.id = wo."subscriptionId"
     where wo."subscriptionId" = $1 and ws."tenantId" = $2
     order by wo."createdAt" desc limit $3`,
    [subscriptionId, user.tenantId, Math.min(200, Math.max(1, limit))],
  );
}

// Test/payload-preview console: builds a synthetic sample event, signs and sends it for
// real against the endpoint (not a simulation), and returns both the exact request that was
// sent and the live response -- mirrors the inbound test-payload console's design for
// consistency across this settings page's two webhook directions. Deliberately NOT written
// to WebhookOutbox -- it's a one-off connectivity/signing check, not a real business event,
// and mixing it into delivery-log stats would misrepresent real endpoint health.
export async function sendTestWebhookDelivery(user: TenantUser, subscriptionId: string) {
  if (!user.tenantId) throw new Error("TENANT_REQUIRED");
  const subscription = await queryOne<{ id: string; url: string; secret: string | null; events: string[] }>(
    `select id, url, secret, events from "WebhookSubscription" where id = $1 and "tenantId" = $2`,
    [subscriptionId, user.tenantId],
  );
  if (!subscription) throw new Error("WEBHOOK_SUBSCRIPTION_NOT_FOUND");

  const eventType = (subscription.events?.[0] as WebhookEventType) ?? "LEAD_CREATED";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({
    eventType,
    eventVersion: 1,
    data: { id: "test-record-id", name: "Test Record", message: "This is a test delivery from the CRM webhook console." },
  });
  const headers: Record<string, string> = { "content-type": "application/json", "x-webhook-timestamp": timestamp, "x-webhook-event": eventType };
  if (subscription.secret) headers["x-webhook-signature"] = signPayload(subscription.secret, timestamp, rawBody);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // F07 fix (WP06): this console is the audit's own worst-case citation for this finding -- it
    // echoes the raw response body straight back to the caller, i.e. an unauthenticated read
    // oracle for anything the server could reach before this check existed.
    await assertSafeOutboundUrl(subscription.url);
    const response = await fetch(subscription.url, { method: "POST", headers, body: rawBody, signal: controller.signal, redirect: "manual" });
    const responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    return { request: { url: subscription.url, headers, body: rawBody }, httpStatus: response.status, responseBody, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { request: { url: subscription.url, headers, body: rawBody }, httpStatus: null, responseBody: null, error: error instanceof Error ? error.message : "Network error" };
  } finally {
    clearTimeout(timeout);
  }
}
